-- RPC to search workspace members for comment mentions
CREATE OR REPLACE FUNCTION public.search_comment_mentions(
    p_workspace_id uuid,
    p_search_term text DEFAULT NULL,
    p_limit integer DEFAULT 20
)
RETURNS TABLE (
    id uuid,
    name text,
    email text,
    avatar_url text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
    v_requester uuid := auth.uid();
    v_workspace public.workspaces%ROWTYPE;
    v_limit integer := GREATEST(1, LEAST(COALESCE(p_limit, 20), 50));
    v_normalized_term text := NULL;
BEGIN
    IF v_requester IS NULL THEN
        RAISE EXCEPTION 'Authentication required.'
            USING ERRCODE = '42501';
    END IF;

    SELECT *
    INTO v_workspace
    FROM public.workspaces w
    WHERE w.id = p_workspace_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Workspace % does not exist.', p_workspace_id
            USING ERRCODE = 'P0001';
    END IF;

    IF v_workspace.type = 'personal' THEN
        IF v_workspace.owner_user_id <> v_requester THEN
            RAISE EXCEPTION 'You do not have access to this workspace.'
                USING ERRCODE = '42501';
        END IF;
    ELSE
        IF NOT EXISTS (
            SELECT 1
            FROM public.team_members tm
            WHERE tm.team_id = v_workspace.team_id
              AND tm.user_id = v_requester
        ) THEN
            RAISE EXCEPTION 'You do not have access to this workspace.'
                USING ERRCODE = '42501';
        END IF;
    END IF;

    v_normalized_term := NULLIF(btrim(lower(COALESCE(p_search_term, ''))), '');

    RETURN QUERY
    WITH workspace_users AS (
        SELECT u.id, u.name, u.email, u.avatar_url
        FROM public.users u
        WHERE
            (v_workspace.type = 'personal' AND u.id = v_workspace.owner_user_id)
            OR
            (v_workspace.type = 'team' AND EXISTS (
                SELECT 1
                FROM public.team_members tm
                WHERE tm.team_id = v_workspace.team_id
                  AND tm.user_id = u.id
            ))
    )
    SELECT wu.id,
           wu.name,
           wu.email,
           wu.avatar_url
    FROM workspace_users wu
    WHERE v_normalized_term IS NULL
       OR lower(wu.name) LIKE v_normalized_term || '%'
       OR lower(wu.email) LIKE v_normalized_term || '%'
    ORDER BY
        CASE
            WHEN v_normalized_term IS NULL THEN 0
            WHEN lower(wu.name) LIKE v_normalized_term || '%' THEN 0
            WHEN lower(wu.email) LIKE v_normalized_term || '%' THEN 1
            ELSE 2
        END,
        lower(wu.name),
        lower(wu.email)
    LIMIT v_limit;
END;
$$;

REVOKE ALL ON FUNCTION public.search_comment_mentions(uuid, text, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.search_comment_mentions(uuid, text, integer) TO authenticated;
COMMENT ON FUNCTION public.search_comment_mentions(uuid, text, integer)
    IS 'Search workspace members eligible for comment mentions with prefix matching on name or email.';
