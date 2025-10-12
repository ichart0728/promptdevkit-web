CREATE OR REPLACE FUNCTION public.restore_prompt_version(
  prompt_id uuid,
  version integer
)
RETURNS public.prompts
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_prompt public.prompts;
  v_version public.prompt_versions;
  v_next_version integer;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required.' USING ERRCODE = '42501';
  END IF;

  SELECT p.*
  INTO v_prompt
  FROM public.prompts p
  WHERE p.id = prompt_id
    AND p.deleted_at IS NULL
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
          AND tm.role IN ('admin', 'editor')
      )
    )
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Prompt not found or permission denied.' USING ERRCODE = '42501';
  END IF;

  SELECT pv.*
  INTO v_version
  FROM public.prompt_versions pv
  WHERE pv.prompt_id = prompt_id
    AND pv.version = version
  LIMIT 1;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Prompt version % not found for prompt %.', version, prompt_id USING ERRCODE = 'P0002';
  END IF;

  SELECT COALESCE(MAX(pv.version), 0) + 1
  INTO v_next_version
  FROM public.prompt_versions pv
  WHERE pv.prompt_id = prompt_id;

  UPDATE public.prompts
  SET title = v_version.title,
      body = v_version.body,
      note = v_version.note,
      tags = COALESCE(v_version.tags, ARRAY[]::text[]),
      updated_by = v_user_id,
      updated_at = now()
  WHERE id = prompt_id
  RETURNING * INTO v_prompt;

  INSERT INTO public.prompt_versions (
    prompt_id,
    version,
    title,
    body,
    note,
    tags,
    updated_by,
    restored_from_version
  )
  VALUES (
    v_prompt.id,
    v_next_version,
    v_version.title,
    v_version.body,
    v_version.note,
    COALESCE(v_version.tags, ARRAY[]::text[]),
    v_user_id,
    v_version.version
  );

  RETURN v_prompt;
END;
$$;

GRANT EXECUTE ON FUNCTION public.restore_prompt_version(uuid, integer) TO authenticated;
