-- Create view summarizing prompt usage per workspace
DROP VIEW IF EXISTS public.workspace_prompt_usage;

CREATE VIEW public.workspace_prompt_usage
WITH (security_invoker = true) AS
SELECT
  w.id,
  w.name,
  COALESCE(COUNT(p.id), 0)::integer AS prompt_count,
  MAX(p.updated_at) AS latest_updated_at
FROM public.workspaces AS w
LEFT JOIN public.prompts AS p
  ON p.workspace_id = w.id
  AND p.deleted_at IS NULL
GROUP BY w.id, w.name;
