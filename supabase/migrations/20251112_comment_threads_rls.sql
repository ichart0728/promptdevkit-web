-- Grant collaborators access to comment threads and tighten comment update checks
ALTER TABLE public.comment_threads ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS select_comment_threads_on_accessible_prompts ON public.comment_threads;
DROP POLICY IF EXISTS insert_comment_threads_on_accessible_prompts ON public.comment_threads;
DROP POLICY IF EXISTS delete_comment_threads_for_authors_and_admins ON public.comment_threads;

CREATE POLICY select_comment_threads_on_accessible_prompts
    ON public.comment_threads
    FOR SELECT
    TO authenticated
    USING (
        EXISTS (
            SELECT 1
            FROM public.prompts p
            WHERE p.id = public.comment_threads.prompt_id
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

CREATE POLICY insert_comment_threads_on_accessible_prompts
    ON public.comment_threads
    FOR INSERT
    TO authenticated
    WITH CHECK (
        public.comment_threads.created_by = auth.uid()
        AND EXISTS (
            SELECT 1
            FROM public.prompts p
            WHERE p.id = public.comment_threads.prompt_id
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

CREATE POLICY delete_comment_threads_for_authors_and_admins
    ON public.comment_threads
    FOR DELETE
    TO authenticated
    USING (
        (
            public.comment_threads.created_by = auth.uid()
            AND EXISTS (
                SELECT 1
                FROM public.prompts p
                WHERE p.id = public.comment_threads.prompt_id
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
                FROM public.prompts p
                WHERE p.id = public.comment_threads.prompt_id
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

DROP POLICY IF EXISTS update_comments_for_authors_and_managers ON public.comments;

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
