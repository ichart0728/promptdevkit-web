-- RLS policies for public.team_members
ALTER TABLE public.team_members ENABLE ROW LEVEL SECURITY;

CREATE POLICY select_team_members_for_members
    ON public.team_members
    FOR SELECT
    TO authenticated
    USING (
        EXISTS (
            SELECT 1
            FROM public.team_members tm2
            WHERE tm2.team_id = public.team_members.team_id
              AND tm2.user_id = auth.uid()
        )
    );

CREATE POLICY insert_team_members_for_admins
    ON public.team_members
    FOR INSERT
    TO authenticated
    WITH CHECK (
        EXISTS (
            SELECT 1
            FROM public.team_members tm2
            WHERE tm2.team_id = public.team_members.team_id
              AND tm2.user_id = auth.uid()
              AND tm2.role = 'admin'
        )
    );

CREATE POLICY update_team_members_for_admins
    ON public.team_members
    FOR UPDATE
    TO authenticated
    USING (
        EXISTS (
            SELECT 1
            FROM public.team_members tm2
            WHERE tm2.team_id = public.team_members.team_id
              AND tm2.user_id = auth.uid()
              AND tm2.role = 'admin'
        )
    )
    WITH CHECK (
        EXISTS (
            SELECT 1
            FROM public.team_members tm2
            WHERE tm2.team_id = public.team_members.team_id
              AND tm2.user_id = auth.uid()
              AND tm2.role = 'admin'
        )
    );

CREATE POLICY delete_team_members_for_admins
    ON public.team_members
    FOR DELETE
    TO authenticated
    USING (
        EXISTS (
            SELECT 1
            FROM public.team_members tm2
            WHERE tm2.team_id = public.team_members.team_id
              AND tm2.user_id = auth.uid()
              AND tm2.role = 'admin'
        )
        OR public.team_members.user_id = auth.uid()
    );
