-- Create view summarizing comment engagement per workspace
DROP VIEW IF EXISTS public.workspace_comment_engagement;

CREATE VIEW public.workspace_comment_engagement
WITH (security_invoker = true) AS
SELECT
  w.id,
  w.name,
  COALESCE(COUNT(c.id), 0)::integer AS comment_count,
  MAX(c.updated_at) AS latest_comment_at
FROM public.workspaces AS w
LEFT JOIN public.prompts AS p
  ON p.workspace_id = w.id
  AND p.deleted_at IS NULL
LEFT JOIN public.comment_threads AS ct
  ON ct.prompt_id = p.id
LEFT JOIN public.comments AS c
  ON c.thread_id = ct.id
  AND c.deleted_at IS NULL
GROUP BY w.id, w.name;
