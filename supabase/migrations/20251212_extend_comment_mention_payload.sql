-- Extend comment mention notification payload with navigation metadata
CREATE OR REPLACE FUNCTION public.handle_comment_mentions()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_unique_mentions uuid[];
  v_prompt_id uuid;
  v_prompt_title text;
  v_author_name text;
  v_target_user uuid;
BEGIN
  -- Ensure the authenticated user matches the comment author when available
  IF auth.uid() IS NOT NULL AND auth.uid() <> NEW.created_by THEN
    RAISE EXCEPTION 'Authenticated user mismatch for comment %', NEW.id
      USING ERRCODE = 'P0001';
  END IF;

  -- Skip when no mentions are provided
  IF NEW.mentions IS NULL OR array_length(NEW.mentions, 1) IS NULL THEN
    RETURN NEW;
  END IF;

  -- Prepare a distinct mention list, ignoring self-mentions and NULLs
  v_unique_mentions := ARRAY(
    SELECT DISTINCT m
    FROM unnest(NEW.mentions) AS m
    WHERE m IS NOT NULL
      AND m <> NEW.created_by
  );

  IF v_unique_mentions IS NULL OR array_length(v_unique_mentions, 1) IS NULL THEN
    RETURN NEW;
  END IF;

  -- Resolve prompt context for the notification payload
  SELECT ct.prompt_id, p.title
  INTO v_prompt_id, v_prompt_title
  FROM public.comment_threads ct
  JOIN public.prompts p ON p.id = ct.prompt_id
  WHERE ct.id = NEW.thread_id;

  IF NOT FOUND THEN
    RETURN NEW;
  END IF;

  SELECT name INTO v_author_name
  FROM public.users
  WHERE id = NEW.created_by;

  IF v_author_name IS NULL THEN
    v_author_name := 'Someone';
  END IF;

  FOREACH v_target_user IN ARRAY v_unique_mentions LOOP
    -- Only notify valid users
    IF EXISTS (SELECT 1 FROM public.users u WHERE u.id = v_target_user) THEN
      -- Avoid duplicate notifications for the same comment & user
      IF NOT EXISTS (
        SELECT 1
        FROM public.notifications n
        WHERE n.user_id = v_target_user
          AND n.type = 'mention'
          AND n.payload ->> 'comment_id' = NEW.id::text
      ) THEN
        INSERT INTO public.notifications (user_id, type, payload)
        VALUES (
          v_target_user,
          'mention',
          jsonb_build_object(
            'title', v_author_name || ' mentioned you',
            'message', v_author_name || ' mentioned you in "' || COALESCE(v_prompt_title, 'this prompt') || '".',
            'action_url', '/prompts/' || v_prompt_id::text || '?thread=' || NEW.thread_id::text || '&comment=' || NEW.id::text,
            'prompt_id', v_prompt_id,
            'thread_id', NEW.thread_id,
            'comment_id', NEW.id
          )
        );
      END IF;
    END IF;
  END LOOP;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS handle_comment_mentions ON public.comments;

CREATE TRIGGER handle_comment_mentions
  AFTER INSERT ON public.comments
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_comment_mentions();
