-- Respect notification preferences when creating comment mention notifications
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

  -- Prepare a distinct mention list, ignoring self-mentions, NULLs, and users who disabled mentions
  v_unique_mentions := ARRAY(
    SELECT DISTINCT u.id
    FROM unnest(NEW.mentions) AS m
    JOIN public.users u ON u.id = m
    LEFT JOIN public.notification_preferences np ON np.user_id = u.id
    WHERE m IS NOT NULL
      AND m <> NEW.created_by
      AND COALESCE(np.allow_mentions, true)
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
  END LOOP;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS handle_comment_mentions ON public.comments;

CREATE TRIGGER handle_comment_mentions
  AFTER INSERT ON public.comments
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_comment_mentions();

-- Regression test: ensure mention notifications respect notification_preferences.allow_mentions
DO $$
DECLARE
  v_plan_id text := 'plan_' || substr(gen_random_uuid()::text, 1, 8);
  v_author_id uuid := gen_random_uuid();
  v_target_id uuid := gen_random_uuid();
  v_workspace_id uuid;
  v_prompt_id uuid;
  v_thread_id uuid;
  v_allowed_comment_id uuid;
  v_blocked_comment_id uuid;
  v_notification_count integer;
BEGIN
  INSERT INTO public.plans (id, name)
  VALUES (v_plan_id, 'Test plan');

  INSERT INTO public.plan_limits (plan_id, key, value_int, note)
  VALUES
    (v_plan_id, 'personal_workspaces', 5, 'test'),
    (v_plan_id, 'prompts_per_personal_ws', 5, 'test'),
    (v_plan_id, 'prompt_versions_per_prompt', 5, 'test'),
    (v_plan_id, 'comment_threads_per_prompt', 5, 'test'),
    (v_plan_id, 'comments_per_thread', 5, 'test');

  INSERT INTO public.users (id, email, name)
  VALUES
    (v_author_id, 'author-' || v_plan_id || '@example.com', 'Author ' || v_plan_id),
    (v_target_id, 'target-' || v_plan_id || '@example.com', 'Target ' || v_plan_id);

  INSERT INTO public.user_plans (user_id, plan_id)
  VALUES (v_author_id, v_plan_id);

  INSERT INTO public.workspaces (id, type, owner_user_id, team_id, name)
  VALUES (gen_random_uuid(), 'personal', v_author_id, NULL, 'Workspace ' || v_plan_id)
  RETURNING id INTO v_workspace_id;

  INSERT INTO public.prompts (id, workspace_id, title, body, note, tags, created_by, updated_by)
  VALUES (gen_random_uuid(), v_workspace_id, 'Prompt ' || v_plan_id, 'Body', NULL, ARRAY[]::text[], v_author_id, v_author_id)
  RETURNING id INTO v_prompt_id;

  INSERT INTO public.comment_threads (id, prompt_id, created_by)
  VALUES (gen_random_uuid(), v_prompt_id, v_author_id)
  RETURNING id INTO v_thread_id;

  INSERT INTO public.comments (id, thread_id, body, mentions, created_by)
  VALUES (gen_random_uuid(), v_thread_id, 'Allowed mention', ARRAY[v_target_id], v_author_id)
  RETURNING id INTO v_allowed_comment_id;

  SELECT COUNT(*)
  INTO v_notification_count
  FROM public.notifications n
  WHERE n.user_id = v_target_id
    AND n.payload ->> 'comment_id' = v_allowed_comment_id::text;

  IF v_notification_count <> 1 THEN
    RAISE EXCEPTION 'Expected one notification for allowed mentions, found %', v_notification_count;
  END IF;

  INSERT INTO public.notification_preferences (user_id, allow_mentions)
  VALUES (v_target_id, false)
  ON CONFLICT (user_id) DO UPDATE
    SET allow_mentions = EXCLUDED.allow_mentions;

  INSERT INTO public.comments (id, thread_id, body, mentions, created_by)
  VALUES (gen_random_uuid(), v_thread_id, 'Blocked mention', ARRAY[v_target_id], v_author_id)
  RETURNING id INTO v_blocked_comment_id;

  SELECT COUNT(*)
  INTO v_notification_count
  FROM public.notifications n
  WHERE n.user_id = v_target_id
    AND n.payload ->> 'comment_id' = v_blocked_comment_id::text;

  IF v_notification_count <> 0 THEN
    RAISE EXCEPTION 'Expected zero notifications for blocked mentions, found %', v_notification_count;
  END IF;

  DELETE FROM public.notifications WHERE user_id = v_target_id;
  DELETE FROM public.comments WHERE thread_id = v_thread_id;
  DELETE FROM public.comment_threads WHERE id = v_thread_id;
  DELETE FROM public.prompts WHERE id = v_prompt_id;
  DELETE FROM public.workspaces WHERE id = v_workspace_id;
  DELETE FROM public.user_plans WHERE user_id = v_author_id;
  DELETE FROM public.notification_preferences WHERE user_id = v_target_id;
  DELETE FROM public.users WHERE id IN (v_author_id, v_target_id);
  DELETE FROM public.plan_limits WHERE plan_id = v_plan_id;
  DELETE FROM public.plans WHERE id = v_plan_id;
END;
$$;
