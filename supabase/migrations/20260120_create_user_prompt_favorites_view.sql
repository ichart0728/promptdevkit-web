-- Create a view that joins prompt favorites with prompt and workspace metadata
CREATE OR REPLACE VIEW public.user_prompt_favorites AS
SELECT
  pf.id,
  pf.user_id,
  pf.prompt_id,
  pf.created_at,
  p.title AS prompt_title,
  p.body AS prompt_body,
  p.note AS prompt_note,
  p.tags AS prompt_tags,
  p.created_at AS prompt_created_at,
  p.updated_at AS prompt_updated_at,
  w.id AS workspace_id,
  w.name AS workspace_name,
  w.type AS workspace_type,
  w.team_id AS workspace_team_id,
  w.owner_user_id AS workspace_owner_user_id
FROM public.prompt_favorites pf
JOIN public.prompts p ON p.id = pf.prompt_id
JOIN public.workspaces w ON w.id = p.workspace_id
WHERE p.deleted_at IS NULL;
