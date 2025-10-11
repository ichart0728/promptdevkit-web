-- Enforce workspace plan limits and expose RPC for workspace creation

-- Trigger function to enforce plan limits on workspace inserts
CREATE OR REPLACE FUNCTION public.enforce_workspace_plan_limits()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_plan_id text;
  v_limit_value integer;
  v_current_usage integer;
  v_limit_key text;
BEGIN
  IF TG_OP <> 'INSERT' THEN
    RETURN NEW;
  END IF;

  IF NEW.type = 'personal' THEN
    v_limit_key := 'personal_workspaces';

    IF NEW.owner_user_id IS NULL THEN
      RAISE EXCEPTION 'Personal workspaces must reference an owner_user_id.' USING ERRCODE = '23502';
    END IF;

    SELECT up.plan_id
    INTO v_plan_id
    FROM public.user_plans up
    WHERE up.user_id = NEW.owner_user_id;

    IF v_plan_id IS NULL THEN
      RAISE EXCEPTION 'No subscription plan is assigned to user %.', NEW.owner_user_id USING ERRCODE = 'P0001';
    END IF;

    SELECT pl.value_int
    INTO v_limit_value
    FROM public.plan_limits pl
    WHERE pl.plan_id = v_plan_id
      AND pl.key = v_limit_key;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Plan % lacks limit configuration for key "%".', v_plan_id, v_limit_key USING ERRCODE = 'P0001';
    END IF;

    IF v_limit_value IS NULL THEN
      RETURN NEW;
    END IF;

    SELECT COUNT(*)
    INTO v_current_usage
    FROM public.workspaces w
    WHERE w.type = 'personal'
      AND w.owner_user_id = NEW.owner_user_id;

    IF v_current_usage >= v_limit_value THEN
      RAISE EXCEPTION 'Plan limit exceeded for key "%" (limit %, current %).', v_limit_key, v_limit_value, v_current_usage
        USING ERRCODE = 'P0001',
              DETAIL = format('Plan %s permits %s %s, current usage is %s.', v_plan_id, v_limit_value, v_limit_key, v_current_usage),
              HINT = 'Upgrade the plan to create additional personal workspaces.';
    END IF;

  ELSIF NEW.type = 'team' THEN
    v_limit_key := 'team_workspaces';

    IF NEW.team_id IS NULL THEN
      RAISE EXCEPTION 'Team workspaces must reference a team_id.' USING ERRCODE = '23502';
    END IF;

    SELECT up.plan_id
    INTO v_plan_id
    FROM public.teams t
    JOIN public.user_plans up ON up.user_id = t.created_by
    WHERE t.id = NEW.team_id;

    IF v_plan_id IS NULL THEN
      RAISE EXCEPTION 'No subscription plan is associated with team %.', NEW.team_id USING ERRCODE = 'P0001';
    END IF;

    SELECT pl.value_int
    INTO v_limit_value
    FROM public.plan_limits pl
    WHERE pl.plan_id = v_plan_id
      AND pl.key = v_limit_key;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Plan % lacks limit configuration for key "%".', v_plan_id, v_limit_key USING ERRCODE = 'P0001';
    END IF;

    IF v_limit_value IS NULL THEN
      RETURN NEW;
    END IF;

    SELECT COUNT(*)
    INTO v_current_usage
    FROM public.workspaces w
    WHERE w.type = 'team'
      AND w.team_id = NEW.team_id;

    IF v_current_usage >= v_limit_value THEN
      RAISE EXCEPTION 'Plan limit exceeded for key "%" (limit %, current %).', v_limit_key, v_limit_value, v_current_usage
        USING ERRCODE = 'P0001',
              DETAIL = format('Plan %s permits %s %s, current usage is %s.', v_plan_id, v_limit_value, v_limit_key, v_current_usage),
              HINT = 'Upgrade the plan to create additional team workspaces.';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

-- Ensure the trigger is present and up to date
DROP TRIGGER IF EXISTS enforce_workspace_plan_limits ON public.workspaces;

CREATE TRIGGER enforce_workspace_plan_limits
BEFORE INSERT ON public.workspaces
FOR EACH ROW
EXECUTE FUNCTION public.enforce_workspace_plan_limits();

-- RPC helper for workspace creation that reuses the trigger-enforced limits
CREATE OR REPLACE FUNCTION public.create_workspace(
  workspace_name text,
  workspace_type workspace_type,
  workspace_team_id uuid DEFAULT NULL
)
RETURNS public.workspaces
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_workspace public.workspaces;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required.' USING ERRCODE = '42501';
  END IF;

  IF workspace_type = 'personal' THEN
    IF workspace_team_id IS NOT NULL THEN
      RAISE EXCEPTION 'Personal workspaces cannot reference a team.' USING ERRCODE = 'P0001';
    END IF;

    INSERT INTO public.workspaces (type, owner_user_id, team_id, name)
    VALUES ('personal', v_user_id, NULL, workspace_name)
    RETURNING * INTO v_workspace;

  ELSIF workspace_type = 'team' THEN
    IF workspace_team_id IS NULL THEN
      RAISE EXCEPTION 'Team workspaces require a team identifier.' USING ERRCODE = '23502';
    END IF;

    IF NOT EXISTS (
      SELECT 1
      FROM public.team_members tm
      WHERE tm.team_id = workspace_team_id
        AND tm.user_id = v_user_id
        AND tm.role = 'admin'
    ) THEN
      RAISE EXCEPTION 'Only team admins can create team workspaces.' USING ERRCODE = '42501';
    END IF;

    INSERT INTO public.workspaces (type, owner_user_id, team_id, name)
    VALUES ('team', NULL, workspace_team_id, workspace_name)
    RETURNING * INTO v_workspace;

  ELSE
    RAISE EXCEPTION 'Unsupported workspace type "%".', workspace_type USING ERRCODE = 'P0001';
  END IF;

  RETURN v_workspace;
END;
$$;

GRANT EXECUTE ON FUNCTION public.create_workspace(text, workspace_type, uuid) TO authenticated;
