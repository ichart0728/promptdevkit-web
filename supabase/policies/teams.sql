-- RLS policies for public.teams
ALTER TABLE public.teams ENABLE ROW LEVEL SECURITY;

CREATE POLICY select_teams_for_members
    ON public.teams
    FOR SELECT
    TO authenticated
    USING (
        EXISTS (
            SELECT 1
            FROM public.team_members tm
            WHERE tm.team_id = public.teams.id
              AND tm.user_id = auth.uid()
        )
        OR public.teams.created_by = auth.uid()
    );

CREATE POLICY insert_teams_for_authenticated_users
    ON public.teams
    FOR INSERT
    TO authenticated
    WITH CHECK (created_by = auth.uid());

CREATE POLICY update_teams_for_admins
    ON public.teams
    FOR UPDATE
    TO authenticated
    USING (
        EXISTS (
            SELECT 1
            FROM public.team_members tm
            WHERE tm.team_id = public.teams.id
              AND tm.user_id = auth.uid()
              AND tm.role = 'admin'
        )
        OR public.teams.created_by = auth.uid()
    )
    WITH CHECK (
        EXISTS (
            SELECT 1
            FROM public.team_members tm
            WHERE tm.team_id = public.teams.id
              AND tm.user_id = auth.uid()
              AND tm.role = 'admin'
        )
        OR public.teams.created_by = auth.uid()
    );

CREATE POLICY delete_teams_for_admins
    ON public.teams
    FOR DELETE
    TO authenticated
    USING (
        EXISTS (
            SELECT 1
            FROM public.team_members tm
            WHERE tm.team_id = public.teams.id
              AND tm.user_id = auth.uid()
              AND tm.role = 'admin'
        )
        OR public.teams.created_by = auth.uid()
    );
