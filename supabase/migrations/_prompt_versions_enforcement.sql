-- Ensure prompt version history is automatically maintained and plan limits enforced
-- (resolve_workspace_plan_id is seeded earlier in 20251109_bootstrap_plans_and_resolver.sql)
CREATE OR REPLACE FUNCTION public.log_prompt_version_history()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_plan_id text;
  v_limit_value integer;
  v_current_versions integer;
  v_next_version integer;
BEGIN
  -- Skip logging when no meaningful changes occurred on update
  IF TG_OP = 'UPDATE' AND
     NEW.title = OLD.title AND
     NEW.body = OLD.body AND
     NEW.note IS NOT DISTINCT FROM OLD.note AND
     NEW.tags IS NOT DISTINCT FROM OLD.tags AND
     NEW.updated_by = OLD.updated_by THEN
    RETURN NEW;
  END IF;

  -- Allow soft deletes to bypass version logging and limit checks since rows
  -- will be cascaded shortly after the `deleted_at` flag is set. Without this
  -- guard, prompts that already reached the plan limit could not be deleted.
  IF TG_OP = 'UPDATE' AND NEW.deleted_at IS NOT NULL THEN
    RETURN NEW;
  END IF;

  v_plan_id := public.resolve_workspace_plan_id(NEW.workspace_id);

  SELECT pl.value_int
  INTO v_limit_value
  FROM public.plan_limits pl
  WHERE pl.plan_id = v_plan_id
    AND pl.key = 'prompt_versions_per_prompt';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Plan % lacks limit configuration for key "%".', v_plan_id, 'prompt_versions_per_prompt'
      USING ERRCODE = 'P0001';
  END IF;

  SELECT COUNT(*)::integer, COALESCE(MAX(version), 0)
  INTO v_current_versions, v_next_version
  FROM public.prompt_versions pv
  WHERE pv.prompt_id = NEW.id;

  IF v_limit_value IS NOT NULL AND v_current_versions >= v_limit_value THEN
    RAISE EXCEPTION 'Plan limit exceeded for key "%" (limit %, current %).', 'prompt_versions_per_prompt', v_limit_value, v_current_versions
      USING ERRCODE = 'P0001',
            DETAIL = format('Plan %s permits %s versions per prompt, current usage is %s.', v_plan_id, v_limit_value, v_current_versions),
            HINT = 'Delete older versions or upgrade the subscription plan to save additional versions.';
  END IF;

  v_next_version := v_next_version + 1;

  INSERT INTO public.prompt_versions (
    prompt_id,
    version,
    title,
    body,
    note,
    tags,
    updated_by,
    restored_from_version,
    created_at
  ) VALUES (
    NEW.id,
    v_next_version,
    NEW.title,
    NEW.body,
    NEW.note,
    NEW.tags,
    NEW.updated_by,
    NULL,
    NEW.updated_at
  )
  ON CONFLICT (prompt_id, version) DO UPDATE
  SET
    title = EXCLUDED.title,
    body = EXCLUDED.body,
    note = EXCLUDED.note,
    tags = EXCLUDED.tags,
    updated_by = EXCLUDED.updated_by,
    restored_from_version = EXCLUDED.restored_from_version,
    created_at = EXCLUDED.created_at;

  RETURN NEW;
END;
$$;

-- Recreate trigger to ensure latest function body is used
DROP TRIGGER IF EXISTS log_prompt_version_history ON public.prompts;

CREATE TRIGGER log_prompt_version_history
AFTER INSERT OR UPDATE ON public.prompts
FOR EACH ROW
EXECUTE FUNCTION public.log_prompt_version_history();
