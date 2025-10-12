-- Enforce favorites per user plan limits
CREATE OR REPLACE FUNCTION public.enforce_prompt_favorite_limits()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_plan_id text;
  v_limit_value integer;
  v_current_usage integer;
  v_remaining integer;
BEGIN
  IF TG_OP <> 'INSERT' THEN
    RETURN NEW;
  END IF;

  SELECT up.plan_id
  INTO v_plan_id
  FROM public.user_plans up
  WHERE up.user_id = NEW.user_id;

  IF v_plan_id IS NULL THEN
    RAISE EXCEPTION 'No subscription plan assigned to user %.', NEW.user_id
      USING ERRCODE = 'P0001';
  END IF;

  SELECT pl.value_int
  INTO v_limit_value
  FROM public.plan_limits pl
  WHERE pl.plan_id = v_plan_id
    AND pl.key = 'favorites_per_user';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Plan % lacks limit configuration for key "%".', v_plan_id, 'favorites_per_user'
      USING ERRCODE = 'P0001';
  END IF;

  IF v_limit_value IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT COUNT(*)
  INTO v_current_usage
  FROM public.prompt_favorites pf
  WHERE pf.user_id = NEW.user_id
    AND EXISTS (
      SELECT 1
      FROM public.prompts p
      JOIN public.workspaces w ON w.id = p.workspace_id
      WHERE p.id = pf.prompt_id
        AND p.deleted_at IS NULL
        AND (
          (w.type = 'personal' AND w.owner_user_id = NEW.user_id)
          OR (
            w.type = 'team'
            AND EXISTS (
              SELECT 1
              FROM public.team_members tm
              WHERE tm.team_id = w.team_id
                AND tm.user_id = NEW.user_id
                AND tm.role IN ('admin', 'editor', 'viewer')
            )
          )
        )
    );

  IF v_current_usage >= v_limit_value THEN
    v_remaining := GREATEST(v_limit_value - v_current_usage, 0);

    RAISE EXCEPTION 'Plan limit exceeded for key "%".', 'favorites_per_user'
      USING ERRCODE = 'P0001',
            DETAIL = format('limit=%s current=%s remaining=%s plan=%s user_id=%s', v_limit_value, v_current_usage, v_remaining, v_plan_id, NEW.user_id),
            HINT = 'Remove prompts from favorites or upgrade the subscription plan.';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS enforce_prompt_favorite_limits ON public.prompt_favorites;

CREATE TRIGGER enforce_prompt_favorite_limits
BEFORE INSERT ON public.prompt_favorites
FOR EACH ROW
EXECUTE FUNCTION public.enforce_prompt_favorite_limits();
