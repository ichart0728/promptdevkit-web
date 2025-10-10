-- RLS policies for public.comments
ALTER TABLE public.comments ENABLE ROW LEVEL SECURITY;

CREATE POLICY select_comments_on_accessible_workspaces
    ON public.comments
    FOR SELECT
    TO authenticated
    USING (
        public.comments.deleted_at IS NULL
        AND EXISTS (
            SELECT 1
            FROM public.comment_threads ct
            JOIN public.prompts p ON p.id = ct.prompt_id
            WHERE ct.id = public.comments.thread_id
              AND p.deleted_at IS NULL
              AND (
                  EXISTS (
                      SELECT 1
                      FROM public.workspaces w
                      WHERE w.id = p.workspace_id
                        AND w.type = 'personal'
                        AND w.owner_user_id = auth.uid()
                  )
                  OR EXISTS (
                      SELECT 1
                      FROM public.workspaces w
                      JOIN public.team_members tm ON tm.team_id = w.team_id
                      WHERE w.id = p.workspace_id
                        AND w.type = 'team'
                        AND tm.user_id = auth.uid()
                  )
              )
        )
    );

CREATE POLICY insert_comments_on_accessible_threads
    ON public.comments
    FOR INSERT
    TO authenticated
    WITH CHECK (
        public.comments.created_by = auth.uid()
        AND EXISTS (
            SELECT 1
            FROM public.comment_threads ct
            JOIN public.prompts p ON p.id = ct.prompt_id
            WHERE ct.id = public.comments.thread_id
              AND p.deleted_at IS NULL
              AND (
                  EXISTS (
                      SELECT 1
                      FROM public.workspaces w
                      WHERE w.id = p.workspace_id
                        AND w.type = 'personal'
                        AND w.owner_user_id = auth.uid()
                  )
                  OR EXISTS (
                      SELECT 1
                      FROM public.workspaces w
                      JOIN public.team_members tm ON tm.team_id = w.team_id
                      WHERE w.id = p.workspace_id
                        AND w.type = 'team'
                        AND tm.user_id = auth.uid()
                        AND tm.role IN ('admin', 'editor', 'viewer')
                  )
              )
        )
    );

CREATE POLICY update_comments_for_authors_and_managers
    ON public.comments
    FOR UPDATE
    TO authenticated
    USING (
        (
            public.comments.created_by = auth.uid()
            AND EXISTS (
                SELECT 1
                FROM public.comment_threads ct
                JOIN public.prompts p ON p.id = ct.prompt_id
                WHERE ct.id = public.comments.thread_id
                  AND (
                      EXISTS (
                          SELECT 1
                          FROM public.workspaces w
                          WHERE w.id = p.workspace_id
                            AND w.type = 'personal'
                            AND w.owner_user_id = auth.uid()
                      )
                      OR EXISTS (
                          SELECT 1
                          FROM public.workspaces w
                          JOIN public.team_members tm ON tm.team_id = w.team_id
                          WHERE w.id = p.workspace_id
                            AND w.type = 'team'
                            AND tm.user_id = auth.uid()
                            AND tm.role IN ('admin', 'editor', 'viewer')
                      )
                  )
            )
        )
        OR (
            EXISTS (
                SELECT 1
                FROM public.comment_threads ct
                JOIN public.prompts p ON p.id = ct.prompt_id
                WHERE ct.id = public.comments.thread_id
                  AND (
                      EXISTS (
                          SELECT 1
                          FROM public.workspaces w
                          WHERE w.id = p.workspace_id
                            AND w.type = 'personal'
                            AND w.owner_user_id = auth.uid()
                      )
                      OR EXISTS (
                          SELECT 1
                          FROM public.workspaces w
                          JOIN public.team_members tm ON tm.team_id = w.team_id
                          WHERE w.id = p.workspace_id
                            AND w.type = 'team'
                            AND tm.user_id = auth.uid()
                            AND tm.role IN ('admin', 'editor')
                      )
                  )
            )
        )
    )
    WITH CHECK (
        (
            public.comments.created_by = auth.uid()
            AND EXISTS (
                SELECT 1
                FROM public.comment_threads ct
                JOIN public.prompts p ON p.id = ct.prompt_id
                WHERE ct.id = public.comments.thread_id
                  AND p.deleted_at IS NULL
                  AND (
                      EXISTS (
                          SELECT 1
                          FROM public.workspaces w
                          WHERE w.id = p.workspace_id
                            AND w.type = 'personal'
                            AND w.owner_user_id = auth.uid()
                      )
                      OR EXISTS (
                          SELECT 1
                          FROM public.workspaces w
                          JOIN public.team_members tm ON tm.team_id = w.team_id
                          WHERE w.id = p.workspace_id
                            AND w.type = 'team'
                            AND tm.user_id = auth.uid()
                            AND tm.role IN ('admin', 'editor', 'viewer')
                      )
                  )
            )
        )
        OR (
            EXISTS (
                SELECT 1
                FROM public.comment_threads ct
                JOIN public.prompts p ON p.id = ct.prompt_id
                WHERE ct.id = public.comments.thread_id
                  AND p.deleted_at IS NULL
                  AND (
                      EXISTS (
                          SELECT 1
                          FROM public.workspaces w
                          WHERE w.id = p.workspace_id
                            AND w.type = 'personal'
                            AND w.owner_user_id = auth.uid()
                      )
                      OR EXISTS (
                          SELECT 1
                          FROM public.workspaces w
                          JOIN public.team_members tm ON tm.team_id = w.team_id
                          WHERE w.id = p.workspace_id
                            AND w.type = 'team'
                            AND tm.user_id = auth.uid()
                            AND tm.role IN ('admin', 'editor')
                      )
                  )
            )
        )
    );

CREATE POLICY delete_comments_for_authors_and_admins
    ON public.comments
    FOR DELETE
    TO authenticated
    USING (
        (
            public.comments.created_by = auth.uid()
            AND EXISTS (
                SELECT 1
                FROM public.comment_threads ct
                JOIN public.prompts p ON p.id = ct.prompt_id
                WHERE ct.id = public.comments.thread_id
                  AND (
                      EXISTS (
                          SELECT 1
                          FROM public.workspaces w
                          WHERE w.id = p.workspace_id
                            AND w.type = 'personal'
                            AND w.owner_user_id = auth.uid()
                      )
                      OR EXISTS (
                          SELECT 1
                          FROM public.workspaces w
                          JOIN public.team_members tm ON tm.team_id = w.team_id
                          WHERE w.id = p.workspace_id
                            AND w.type = 'team'
                            AND tm.user_id = auth.uid()
                            AND tm.role IN ('admin', 'editor', 'viewer')
                      )
                  )
            )
        )
        OR (
            EXISTS (
                SELECT 1
                FROM public.comment_threads ct
                JOIN public.prompts p ON p.id = ct.prompt_id
                WHERE ct.id = public.comments.thread_id
                  AND (
                      EXISTS (
                          SELECT 1
                          FROM public.workspaces w
                          WHERE w.id = p.workspace_id
                            AND w.type = 'personal'
                            AND w.owner_user_id = auth.uid()
                      )
                      OR EXISTS (
                          SELECT 1
                          FROM public.workspaces w
                          JOIN public.team_members tm ON tm.team_id = w.team_id
                          WHERE w.id = p.workspace_id
                            AND w.type = 'team'
                            AND tm.user_id = auth.uid()
                            AND tm.role = 'admin'
                      )
                  )
            )
        )
    );
