-- Enforce prompt per-workspace plan limits via trigger
-- NOTE: When the limit is exceeded this trigger raises SQLSTATE P0001 with
-- DETAIL formatted as 'limit=<int> current=<int> remaining=<int> plan=<text> workspace_id=<uuid>'
-- and HINT 'Reduce prompts in this workspace or upgrade the subscription plan.'
-- Frontend handlers can rely on this contract for user messaging.

CREATE OR REPLACE FUNCTION public.enforce_prompt_plan_limits()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_workspace public.workspaces%ROWTYPE;
  v_plan_id text;
  v_limit_key text;
  v_limit_value integer;
  v_current_usage integer;
  v_remaining integer;
BEGIN
  IF TG_OP <> 'INSERT' THEN
    RETURN NEW;
  END IF;

  SELECT w.*
  INTO v_workspace
  FROM public.workspaces w
  WHERE w.id = NEW.workspace_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Workspace % does not exist.', NEW.workspace_id
      USING ERRCODE = 'P0001';
  END IF;

  IF v_workspace.type = 'personal' THEN
    v_limit_key := 'prompts_per_personal_ws';

    IF v_workspace.owner_user_id IS NULL THEN
      RAISE EXCEPTION 'Personal workspace % is missing owner_user_id.', NEW.workspace_id
        USING ERRCODE = 'P0001';
    END IF;

    SELECT up.plan_id
    INTO v_plan_id
    FROM public.user_plans up
    WHERE up.user_id = v_workspace.owner_user_id;
  ELSE
    v_limit_key := 'prompts_per_team_ws';

    IF v_workspace.team_id IS NULL THEN
      RAISE EXCEPTION 'Team workspace % is missing team_id.', NEW.workspace_id
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

  IF v_limit_value IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT COUNT(*)
  INTO v_current_usage
  FROM public.prompts p
  WHERE p.workspace_id = NEW.workspace_id
    AND p.deleted_at IS NULL;

  IF v_current_usage >= v_limit_value THEN
    v_remaining := GREATEST(v_limit_value - v_current_usage, 0);

    RAISE EXCEPTION 'Plan limit exceeded for key "%".', v_limit_key
      USING ERRCODE = 'P0001',
            DETAIL = format('limit=%s current=%s remaining=%s plan=%s workspace_id=%s', v_limit_value, v_current_usage, v_remaining, v_plan_id, NEW.workspace_id),
            HINT = 'Reduce prompts in this workspace or upgrade the subscription plan.';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS enforce_prompt_plan_limits ON public.prompts;

CREATE TRIGGER enforce_prompt_plan_limits
BEFORE INSERT ON public.prompts
FOR EACH ROW
EXECUTE FUNCTION public.enforce_prompt_plan_limits();
