-- RLS policies for public.prompts
ALTER TABLE public.prompts ENABLE ROW LEVEL SECURITY;

CREATE POLICY select_prompts_on_accessible_workspaces
    ON public.prompts
    FOR SELECT
    TO authenticated
    USING (
        public.prompts.deleted_at IS NULL
        AND (
            EXISTS (
                SELECT 1
                FROM public.workspaces w
                WHERE w.id = public.prompts.workspace_id
                  AND w.type = 'personal'
                  AND w.owner_user_id = auth.uid()
            )
            OR EXISTS (
                SELECT 1
                FROM public.workspaces w
                JOIN public.team_members tm ON tm.team_id = w.team_id
                WHERE w.id = public.prompts.workspace_id
                  AND w.type = 'team'
                  AND tm.user_id = auth.uid()
            )
        )
    );

CREATE POLICY insert_prompts_for_workspace_collaborators
    ON public.prompts
    FOR INSERT
    TO authenticated
    WITH CHECK (
        (
            EXISTS (
                SELECT 1
                FROM public.workspaces w
                WHERE w.id = public.prompts.workspace_id
                  AND w.type = 'personal'
                  AND w.owner_user_id = auth.uid()
            )
        )
        OR (
            EXISTS (
                SELECT 1
                FROM public.workspaces w
                JOIN public.team_members tm ON tm.team_id = w.team_id
                WHERE w.id = public.prompts.workspace_id
                  AND w.type = 'team'
                  AND tm.user_id = auth.uid()
                  AND tm.role IN ('admin', 'editor')
            )
        )
        AND public.prompts.created_by = auth.uid()
        AND public.prompts.updated_by = auth.uid()
    );

CREATE POLICY update_prompts_for_workspace_collaborators
    ON public.prompts
    FOR UPDATE
    TO authenticated
    USING (
        public.prompts.deleted_at IS NULL
        AND (
            EXISTS (
                SELECT 1
                FROM public.workspaces w
                WHERE w.id = public.prompts.workspace_id
                  AND w.type = 'personal'
                  AND w.owner_user_id = auth.uid()
            )
            OR EXISTS (
                SELECT 1
                FROM public.workspaces w
                JOIN public.team_members tm ON tm.team_id = w.team_id
                WHERE w.id = public.prompts.workspace_id
                  AND w.type = 'team'
                  AND tm.user_id = auth.uid()
                  AND tm.role IN ('admin', 'editor')
            )
        )
    )
    WITH CHECK (
        (
            EXISTS (
                SELECT 1
                FROM public.workspaces w
                WHERE w.id = public.prompts.workspace_id
                  AND w.type = 'personal'
                  AND w.owner_user_id = auth.uid()
            )
        )
        OR (
            EXISTS (
                SELECT 1
                FROM public.workspaces w
                JOIN public.team_members tm ON tm.team_id = w.team_id
                WHERE w.id = public.prompts.workspace_id
                  AND w.type = 'team'
                  AND tm.user_id = auth.uid()
                  AND tm.role IN ('admin', 'editor')
            )
        )
        AND public.prompts.updated_by = auth.uid()
    );

CREATE POLICY delete_prompts_for_workspace_admins
    ON public.prompts
    FOR DELETE
    TO authenticated
    USING (
        EXISTS (
            SELECT 1
            FROM public.workspaces w
            WHERE w.id = public.prompts.workspace_id
              AND w.type = 'personal'
              AND w.owner_user_id = auth.uid()
        )
        OR EXISTS (
            SELECT 1
            FROM public.workspaces w
            JOIN public.team_members tm ON tm.team_id = w.team_id
            WHERE w.id = public.prompts.workspace_id
              AND w.type = 'team'
              AND tm.user_id = auth.uid()
              AND tm.role = 'admin'
        )
    );
