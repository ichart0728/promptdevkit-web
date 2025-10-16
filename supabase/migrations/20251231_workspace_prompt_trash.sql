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
