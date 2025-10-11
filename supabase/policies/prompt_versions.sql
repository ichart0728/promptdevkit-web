-- RLS policies for public.prompt_versions
ALTER TABLE public.prompt_versions ENABLE ROW LEVEL SECURITY;

-- Authenticated users can read versions for prompts in workspaces they can access
CREATE POLICY select_prompt_versions_on_accessible_workspaces
    ON public.prompt_versions
    FOR SELECT
    TO authenticated
    USING (
        EXISTS (
            SELECT 1
            FROM public.prompts p
            WHERE p.id = public.prompt_versions.prompt_id
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
