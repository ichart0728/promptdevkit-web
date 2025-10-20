-- Purge all trashed prompts for a workspace
CREATE OR REPLACE FUNCTION public.purge_workspace_prompt_trash(
  p_workspace_id uuid
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_deleted_count integer := 0;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required.' USING ERRCODE = '42501';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.workspaces w
    WHERE w.id = p_workspace_id
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
  ) THEN
    RAISE EXCEPTION 'Workspace % not found or permission denied.', p_workspace_id
      USING ERRCODE = '42501';
  END IF;

  DELETE FROM public.prompts
  WHERE workspace_id = p_workspace_id
    AND deleted_at IS NOT NULL;

  GET DIAGNOSTICS v_deleted_count = ROW_COUNT;

  RETURN COALESCE(v_deleted_count, 0);
END;
$$;

REVOKE ALL ON FUNCTION public.purge_workspace_prompt_trash(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.purge_workspace_prompt_trash(uuid) TO authenticated;
