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
        CASE
            WHEN EXISTS (
                SELECT 1
                FROM public.team_members tm_existing
                WHERE tm_existing.team_id = public.team_members.team_id
                  AND tm_existing.user_id = auth.uid()
                  AND tm_existing.role = 'admin'
            ) THEN TRUE
            WHEN EXISTS (
                SELECT 1
                FROM public.teams t
                WHERE t.id = public.team_members.team_id
                  AND t.created_by = auth.uid()
            ) THEN (
                public.team_members.user_id = auth.uid()
                AND public.team_members.role = 'admin'
            )
            ELSE FALSE
        END
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
