-- Workspace prompt trash view and management RPCs

CREATE OR REPLACE VIEW public.workspace_prompt_trash
WITH (security_invoker = on)
AS
SELECT
    p.id,
    p.workspace_id,
    w.name AS workspace_name,
    p.title,
    p.note,
    p.tags,
    p.created_by,
    p.created_at,
    p.updated_by,
    p.updated_at,
    p.deleted_at
FROM public.prompts p
JOIN public.workspaces w ON w.id = p.workspace_id
WHERE p.deleted_at IS NOT NULL;

GRANT SELECT ON public.workspace_prompt_trash TO authenticated;

CREATE OR REPLACE FUNCTION public.restore_prompt_from_trash(
  p_prompt_id uuid
)
RETURNS public.prompts
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_prompt public.prompts;
  v_workspace public.workspaces%ROWTYPE;
  v_plan_id text;
  v_limit_key text;
  v_limit_value integer;
  v_current_usage integer;
  v_remaining integer;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required.' USING ERRCODE = '42501';
  END IF;

  SELECT p.*
  INTO v_prompt
  FROM public.prompts p
  WHERE p.id = p_prompt_id
    AND p.deleted_at IS NOT NULL
    AND (
      EXISTS (
        SELECT 1
        FROM public.workspaces w
        WHERE w.id = p.workspace_id
          AND w.type = 'personal'
          AND w.owner_user_id = v_user_id
      )
      OR EXISTS (
        SELECT 1
        FROM public.workspaces w
        JOIN public.team_members tm ON tm.team_id = w.team_id
        WHERE w.id = p.workspace_id
          AND w.type = 'team'
          AND tm.user_id = v_user_id
          AND tm.role = 'admin'
      )
    )
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Prompt not found in trash or permission denied.' USING ERRCODE = '42501';
  END IF;

  SELECT w.*
  INTO v_workspace
  FROM public.workspaces w
  WHERE w.id = v_prompt.workspace_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Workspace % does not exist.', v_prompt.workspace_id
      USING ERRCODE = 'P0001';
  END IF;

  IF v_workspace.type = 'personal' THEN
    v_limit_key := 'prompts_per_personal_ws';

    IF v_workspace.owner_user_id IS NULL THEN
      RAISE EXCEPTION 'Personal workspace % is missing owner_user_id.', v_prompt.workspace_id
        USING ERRCODE = 'P0001';
    END IF;

    SELECT up.plan_id
    INTO v_plan_id
    FROM public.user_plans up
    WHERE up.user_id = v_workspace.owner_user_id;
  ELSE
    v_limit_key := 'prompts_per_team_ws';

    IF v_workspace.team_id IS NULL THEN
      RAISE EXCEPTION 'Team workspace % is missing team_id.', v_prompt.workspace_id
        USING ERRCODE = 'P0001';
    END IF;

    SELECT up.plan_id
    INTO v_plan_id
    FROM public.teams t
    JOIN public.user_plans up ON up.user_id = t.created_by
    WHERE t.id = v_workspace.team_id;
  END IF;

  IF v_plan_id IS NULL THEN
    IF v_workspace.type = 'personal' THEN
      RAISE EXCEPTION 'No subscription plan assigned to user %.', v_workspace.owner_user_id
        USING ERRCODE = 'P0001';
    ELSE
      RAISE EXCEPTION 'No subscription plan associated with team %.', v_workspace.team_id
        USING ERRCODE = 'P0001';
    END IF;
  END IF;

  SELECT pl.value_int
  INTO v_limit_value
  FROM public.plan_limits pl
  WHERE pl.plan_id = v_plan_id
    AND pl.key = v_limit_key;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Plan % lacks limit configuration for key "%".', v_plan_id, v_limit_key
      USING ERRCODE = 'P0001';
  END IF;

  IF v_limit_value IS NOT NULL THEN
    SELECT COUNT(*)
    INTO v_current_usage
    FROM public.prompts p
    WHERE p.workspace_id = v_prompt.workspace_id
      AND p.deleted_at IS NULL;

    IF v_current_usage >= v_limit_value THEN
      v_remaining := GREATEST(v_limit_value - v_current_usage, 0);

      RAISE EXCEPTION 'Plan limit exceeded for key "%".', v_limit_key
        USING ERRCODE = 'P0001',
              DETAIL = format(
                'limit=%s current=%s remaining=%s plan=%s workspace_id=%s',
                v_limit_value,
                v_current_usage,
                v_remaining,
                v_plan_id,
                v_prompt.workspace_id
              ),
              HINT = 'Reduce prompts in this workspace or upgrade the subscription plan.';
    END IF;
  END IF;

  UPDATE public.prompts
  SET deleted_at = NULL,
      updated_at = now(),
      updated_by = v_user_id
  WHERE id = v_prompt.id
  RETURNING * INTO v_prompt;

  RETURN v_prompt;
END;
$$;

GRANT EXECUTE ON FUNCTION public.restore_prompt_from_trash(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.purge_prompt_from_trash(
  p_prompt_id uuid
)
RETURNS public.prompts
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_prompt public.prompts;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required.' USING ERRCODE = '42501';
  END IF;

  SELECT p.*
  INTO v_prompt
  FROM public.prompts p
  WHERE p.id = p_prompt_id
    AND p.deleted_at IS NOT NULL
    AND (
      EXISTS (
        SELECT 1
        FROM public.workspaces w
        WHERE w.id = p.workspace_id
          AND w.type = 'personal'
          AND w.owner_user_id = v_user_id
      )
      OR EXISTS (
        SELECT 1
        FROM public.workspaces w
        JOIN public.team_members tm ON tm.team_id = w.team_id
        WHERE w.id = p.workspace_id
          AND w.type = 'team'
          AND tm.user_id = v_user_id
          AND tm.role = 'admin'
      )
    )
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Prompt not found in trash or permission denied.' USING ERRCODE = '42501';
  END IF;

  DELETE FROM public.prompts
  WHERE id = v_prompt.id;

  RETURN v_prompt;
END;
$$;

GRANT EXECUTE ON FUNCTION public.purge_prompt_from_trash(uuid) TO authenticated;
