-- RLS policies for public.workspaces
ALTER TABLE public.workspaces ENABLE ROW LEVEL SECURITY;

CREATE POLICY select_workspaces_for_members
    ON public.workspaces
    FOR SELECT
    TO authenticated
    USING (
        (
            public.workspaces.type = 'personal'
            AND public.workspaces.owner_user_id = auth.uid()
        )
        OR (
            public.workspaces.type = 'team'
            AND EXISTS (
                SELECT 1
                FROM public.team_members tm
                WHERE tm.team_id = public.workspaces.team_id
                  AND tm.user_id = auth.uid()
            )
        )
    );

CREATE POLICY insert_workspaces_for_owners
    ON public.workspaces
    FOR INSERT
    TO authenticated
    WITH CHECK (
        (
            public.workspaces.type = 'personal'
            AND public.workspaces.owner_user_id = auth.uid()
        )
        OR (
            public.workspaces.type = 'team'
            AND EXISTS (
                SELECT 1
                FROM public.team_members tm
                WHERE tm.team_id = public.workspaces.team_id
                  AND tm.user_id = auth.uid()
                  AND tm.role = 'admin'
            )
        )
    );

CREATE POLICY update_workspaces_for_controllers
    ON public.workspaces
    FOR UPDATE
    TO authenticated
    USING (
        (
            public.workspaces.type = 'personal'
            AND public.workspaces.owner_user_id = auth.uid()
        )
        OR (
            public.workspaces.type = 'team'
            AND EXISTS (
                SELECT 1
                FROM public.team_members tm
                WHERE tm.team_id = public.workspaces.team_id
                  AND tm.user_id = auth.uid()
                  AND tm.role = 'admin'
            )
        )
    )
    WITH CHECK (
        (
            public.workspaces.type = 'personal'
            AND public.workspaces.owner_user_id = auth.uid()
        )
        OR (
            public.workspaces.type = 'team'
            AND EXISTS (
                SELECT 1
                FROM public.team_members tm
                WHERE tm.team_id = public.workspaces.team_id
                  AND tm.user_id = auth.uid()
                  AND tm.role = 'admin'
            )
        )
    );

CREATE POLICY delete_workspaces_for_controllers
    ON public.workspaces
    FOR DELETE
    TO authenticated
    USING (
        (
            public.workspaces.type = 'personal'
            AND public.workspaces.owner_user_id = auth.uid()
        )
        OR (
            public.workspaces.type = 'team'
            AND EXISTS (
                SELECT 1
                FROM public.team_members tm
                WHERE tm.team_id = public.workspaces.team_id
                  AND tm.user_id = auth.uid()
                  AND tm.role = 'admin'
            )
        )
    );
