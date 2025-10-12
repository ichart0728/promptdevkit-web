-- Enable RLS and policies for prompt favorites
ALTER TABLE public.prompt_favorites ENABLE ROW LEVEL SECURITY;

CREATE POLICY select_prompt_favorites_for_collaborators
    ON public.prompt_favorites
    FOR SELECT
    TO authenticated
    USING (
        public.prompt_favorites.user_id = auth.uid()
        AND EXISTS (
            SELECT 1
            FROM public.prompts p
            WHERE p.id = public.prompt_favorites.prompt_id
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

CREATE POLICY insert_prompt_favorites_for_collaborators
    ON public.prompt_favorites
    FOR INSERT
    TO authenticated
    WITH CHECK (
        public.prompt_favorites.user_id = auth.uid()
        AND EXISTS (
            SELECT 1
            FROM public.prompts p
            WHERE p.id = public.prompt_favorites.prompt_id
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

CREATE POLICY delete_prompt_favorites_for_collaborators
    ON public.prompt_favorites
    FOR DELETE
    TO authenticated
    USING (
        public.prompt_favorites.user_id = auth.uid()
        AND EXISTS (
            SELECT 1
            FROM public.prompts p
            WHERE p.id = public.prompt_favorites.prompt_id
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
