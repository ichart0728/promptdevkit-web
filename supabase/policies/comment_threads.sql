-- RLS policies for public.comment_threads
ALTER TABLE public.comment_threads ENABLE ROW LEVEL SECURITY;

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
