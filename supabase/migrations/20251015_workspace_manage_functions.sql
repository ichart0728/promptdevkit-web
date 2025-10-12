CREATE OR REPLACE FUNCTION public.manage_workspace(
  workspace_id uuid,
  action text,
  workspace_name text DEFAULT NULL
)
RETURNS public.workspaces
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_workspace public.workspaces;
  v_trimmed_name text := NULL;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required.' USING ERRCODE = '42501';
  END IF;

  SELECT *
  INTO v_workspace
  FROM public.workspaces w
  WHERE w.id = workspace_id
    AND (
      (w.type = 'personal' AND w.owner_user_id = v_user_id)
      OR (
        w.type = 'team'
        AND EXISTS (
          SELECT 1
          FROM public.team_members tm
          WHERE tm.team_id = w.team_id
            AND tm.user_id = v_user_id
            AND tm.role = 'admin'
        )
      )
    )
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Workspace not found or permission denied.' USING ERRCODE = '42501';
  END IF;

  IF action = 'rename' THEN
    v_trimmed_name := NULLIF(btrim(workspace_name), '');

    IF v_trimmed_name IS NULL THEN
      RAISE EXCEPTION 'Workspace name is required.' USING ERRCODE = '23514';
    END IF;

    UPDATE public.workspaces
    SET name = v_trimmed_name
    WHERE id = workspace_id
    RETURNING * INTO v_workspace;

  ELSIF action = 'archive' THEN
    IF v_workspace.archived_at IS NOT NULL THEN
      RETURN v_workspace;
    END IF;

    UPDATE public.workspaces
    SET archived_at = now()
    WHERE id = workspace_id
    RETURNING * INTO v_workspace;

  ELSIF action = 'restore' THEN
    IF v_workspace.archived_at IS NULL THEN
      RETURN v_workspace;
    END IF;

    UPDATE public.workspaces
    SET archived_at = NULL
    WHERE id = workspace_id
    RETURNING * INTO v_workspace;

  ELSE
    RAISE EXCEPTION 'Unsupported action "%".', action USING ERRCODE = 'P0001';
  END IF;

  RETURN v_workspace;
END;
$$;

GRANT EXECUTE ON FUNCTION public.manage_workspace(uuid, text, text) TO authenticated;
