-- RPC to invite a team member by email while respecting RLS
CREATE OR REPLACE FUNCTION public.invite_team_member(
    p_team_id uuid,
    p_invitee_email text,
    p_role public.team_member_role DEFAULT 'viewer'::public.team_member_role
)
RETURNS TABLE (
    id uuid,
    role public.team_member_role,
    joined_at timestamptz,
    member jsonb
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
    v_inviter uuid := auth.uid();
    v_team public.teams%ROWTYPE;
    v_invitee public.users%ROWTYPE;
    v_member public.team_members%ROWTYPE;
    v_normalized_email text := lower(trim(p_invitee_email));
BEGIN
    IF v_inviter IS NULL THEN
        RAISE EXCEPTION 'Authentication required.'
            USING ERRCODE = '42501';
    END IF;

    IF v_normalized_email IS NULL OR length(v_normalized_email) = 0 THEN
        RAISE EXCEPTION 'Email address is required.'
            USING ERRCODE = '22023';
    END IF;

    SELECT *
    INTO v_team
    FROM public.teams t
    WHERE t.id = p_team_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Team % does not exist.', p_team_id
            USING ERRCODE = 'P0001';
    END IF;

    IF NOT EXISTS (
        SELECT 1
        FROM public.team_members tm_admin
        WHERE tm_admin.team_id = p_team_id
          AND tm_admin.user_id = v_inviter
          AND tm_admin.role = 'admin'
    ) THEN
        RAISE EXCEPTION 'You do not have permission to invite members to this team.'
            USING ERRCODE = '42501';
    END IF;

    SELECT *
    INTO v_invitee
    FROM public.users u
    WHERE lower(u.email) = v_normalized_email
    LIMIT 1;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'No user found for the provided email address.'
            USING ERRCODE = 'P0200';
    END IF;

    INSERT INTO public.team_members (team_id, user_id, role)
    VALUES (p_team_id, v_invitee.id, p_role)
    RETURNING * INTO v_member;

    RETURN QUERY
    SELECT
        v_member.id,
        v_member.role,
        v_member.joined_at,
        jsonb_build_object(
            'id', v_invitee.id,
            'email', v_invitee.email,
            'name', v_invitee.name,
            'avatar_url', v_invitee.avatar_url
        ) AS member;
END;
$$;

REVOKE ALL ON FUNCTION public.invite_team_member(uuid, text, public.team_member_role) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.invite_team_member(uuid, text, public.team_member_role) TO authenticated;
COMMENT ON FUNCTION public.invite_team_member(uuid, text, public.team_member_role)
    IS 'Invite a user to a team by email after validating permissions and plan limits.';
