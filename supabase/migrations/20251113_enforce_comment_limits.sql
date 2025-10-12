-- Enforce plan limits for discussion features and expose a helper RPC
CREATE OR REPLACE FUNCTION public.enforce_comment_thread_plan_limits()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_workspace_id uuid;
  v_plan_id text;
  v_limit_value integer;
  v_current_threads integer;
BEGIN
  SELECT p.workspace_id
  INTO v_workspace_id
  FROM public.prompts p
  WHERE p.id = NEW.prompt_id
    AND p.deleted_at IS NULL;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Prompt % not found or not accessible.', NEW.prompt_id
      USING ERRCODE = 'P0001',
            DETAIL = 'The target prompt either does not exist or has been deleted.',
            HINT = 'Verify the prompt exists and remains accessible before creating a thread.';
  END IF;

  v_plan_id := public.resolve_workspace_plan_id(v_workspace_id);

  SELECT pl.value_int
  INTO v_limit_value
  FROM public.plan_limits pl
  WHERE pl.plan_id = v_plan_id
    AND pl.key = 'comment_threads_per_prompt';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Plan % lacks limit configuration for key "%".', v_plan_id, 'comment_threads_per_prompt'
      USING ERRCODE = 'P0001';
  END IF;

  IF v_limit_value IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT COUNT(*)::integer
  INTO v_current_threads
  FROM public.comment_threads ct
  WHERE ct.prompt_id = NEW.prompt_id;

  IF v_current_threads >= v_limit_value THEN
    RAISE EXCEPTION 'Plan limit exceeded for key "%" (limit %, current %).', 'comment_threads_per_prompt', v_limit_value, v_current_threads
      USING ERRCODE = 'P0001',
            DETAIL = format('Plan %s permits %s threads per prompt, current usage is %s.', v_plan_id, v_limit_value, v_current_threads),
            HINT = 'Delete existing threads or upgrade the subscription plan to create additional threads.';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS enforce_comment_thread_plan_limits ON public.comment_threads;

CREATE TRIGGER enforce_comment_thread_plan_limits
    BEFORE INSERT ON public.comment_threads
    FOR EACH ROW
    EXECUTE FUNCTION public.enforce_comment_thread_plan_limits();

CREATE OR REPLACE FUNCTION public.enforce_comments_per_thread_limit()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_prompt_id uuid;
  v_workspace_id uuid;
  v_plan_id text;
  v_limit_value integer;
  v_current_comments integer;
BEGIN
  SELECT ct.prompt_id, p.workspace_id
  INTO v_prompt_id, v_workspace_id
  FROM public.comment_threads ct
  JOIN public.prompts p ON p.id = ct.prompt_id
  WHERE ct.id = NEW.thread_id
    AND p.deleted_at IS NULL;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Comment thread % not found or not accessible.', NEW.thread_id
      USING ERRCODE = 'P0001',
            DETAIL = 'The associated comment_thread row is missing or its prompt has been deleted.',
            HINT = 'Ensure the thread still exists before posting a comment.';
  END IF;

  v_plan_id := public.resolve_workspace_plan_id(v_workspace_id);

  SELECT pl.value_int
  INTO v_limit_value
  FROM public.plan_limits pl
  WHERE pl.plan_id = v_plan_id
    AND pl.key = 'comments_per_thread';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Plan % lacks limit configuration for key "%".', v_plan_id, 'comments_per_thread'
      USING ERRCODE = 'P0001';
  END IF;

  IF v_limit_value IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT COUNT(*)::integer
  INTO v_current_comments
  FROM public.comments c
  WHERE c.thread_id = NEW.thread_id
    AND c.deleted_at IS NULL;

  IF v_current_comments >= v_limit_value THEN
    RAISE EXCEPTION 'Plan limit exceeded for key "%" (limit %, current %).', 'comments_per_thread', v_limit_value, v_current_comments
      USING ERRCODE = 'P0001',
            DETAIL = format('Plan %s permits %s comments per thread, current usage is %s.', v_plan_id, v_limit_value, v_current_comments),
            HINT = 'Delete existing comments or upgrade the subscription plan to add more comments.';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS enforce_comments_per_thread_limit ON public.comments;

CREATE TRIGGER enforce_comments_per_thread_limit
    BEFORE INSERT ON public.comments
    FOR EACH ROW
    EXECUTE FUNCTION public.enforce_comments_per_thread_limit();

CREATE OR REPLACE FUNCTION public.create_comment_thread(
    p_prompt_id uuid,
    p_body text,
    p_mentions uuid[] DEFAULT ARRAY[]::uuid[]
)
RETURNS public.comment_threads
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_thread public.comment_threads;
  v_mentions uuid[] := COALESCE(p_mentions, ARRAY[]::uuid[]);
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required.' USING ERRCODE = 'P0001';
  END IF;

  IF p_body IS NULL OR btrim(p_body) = '' THEN
    RAISE EXCEPTION 'Comment body must not be empty.' USING ERRCODE = 'P0001';
  END IF;

  IF NOT EXISTS (
      SELECT 1
      FROM public.prompts p
      WHERE p.id = p_prompt_id
        AND p.deleted_at IS NULL
        AND (
            EXISTS (
                SELECT 1
                FROM public.workspaces w
                WHERE w.id = p.workspace_id
                  AND w.type = 'personal'
                  AND w.owner_user_id = auth.uid()
            )
            OR EXISTS (
                SELECT 1
                FROM public.workspaces w
                JOIN public.team_members tm ON tm.team_id = w.team_id
                WHERE w.id = p.workspace_id
                  AND w.type = 'team'
                  AND tm.user_id = auth.uid()
                  AND tm.role IN ('admin', 'editor', 'viewer')
            )
        )
  ) THEN
    RAISE EXCEPTION 'You do not have access to prompt %.', p_prompt_id
      USING ERRCODE = 'P0001',
            DETAIL = 'The prompt either does not exist or you lack permission to access it.',
            HINT = 'Join the workspace or request access before creating a discussion thread.';
  END IF;

  INSERT INTO public.comment_threads (prompt_id, created_by)
  VALUES (p_prompt_id, auth.uid())
  RETURNING * INTO v_thread;

  INSERT INTO public.comments (thread_id, body, mentions, created_by)
  VALUES (v_thread.id, p_body, v_mentions, auth.uid());

  RETURN v_thread;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.create_comment_thread(uuid, text, uuid[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_comment_thread(uuid, text, uuid[]) TO authenticated;
