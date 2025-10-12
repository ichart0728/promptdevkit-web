-- Enforce plan limits for team member counts
CREATE OR REPLACE FUNCTION public.enforce_team_member_plan_limits()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_team public.teams%ROWTYPE;
  v_plan_id text;
  v_limit_value integer;
  v_current_members integer;
  v_remaining integer;
BEGIN
  IF TG_OP <> 'INSERT' THEN
    RETURN NEW;
  END IF;

  SELECT *
  INTO v_team
  FROM public.teams t
  WHERE t.id = NEW.team_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Team % does not exist.', NEW.team_id
      USING ERRCODE = 'P0001';
  END IF;

  SELECT up.plan_id
  INTO v_plan_id
  FROM public.user_plans up
  WHERE up.user_id = v_team.created_by;

  IF v_plan_id IS NULL THEN
    RAISE EXCEPTION 'No subscription plan associated with team %.', NEW.team_id
      USING ERRCODE = 'P0001';
  END IF;

  SELECT pl.value_int
  INTO v_limit_value
  FROM public.plan_limits pl
  WHERE pl.plan_id = v_plan_id
    AND pl.key = 'members_per_team';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Plan % lacks limit configuration for key "%".', v_plan_id, 'members_per_team'
      USING ERRCODE = 'P0001';
  END IF;

  IF v_limit_value IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT COUNT(*)
  INTO v_current_members
  FROM (
    SELECT 1
    FROM public.team_members tm
    WHERE tm.team_id = NEW.team_id
    FOR UPDATE
  ) AS existing_members;

  IF v_current_members >= v_limit_value THEN
    v_remaining := GREATEST(v_limit_value - v_current_members, 0);

    RAISE EXCEPTION 'Plan limit exceeded for key "%".', 'members_per_team'
      USING ERRCODE = 'P0001',
            DETAIL = format('limit=%s current=%s remaining=%s plan=%s team_id=%s', v_limit_value, v_current_members, v_remaining, v_plan_id, NEW.team_id),
            HINT = 'Remove members from this team or upgrade the subscription plan.';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS enforce_team_member_plan_limits ON public.team_members;

CREATE TRIGGER enforce_team_member_plan_limits
BEFORE INSERT ON public.team_members
FOR EACH ROW
EXECUTE FUNCTION public.enforce_team_member_plan_limits();
