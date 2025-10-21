-- Summarize daily prompt updates per workspace
DROP VIEW IF EXISTS public.workspace_prompt_activity_daily;

CREATE VIEW public.workspace_prompt_activity_daily
WITH (security_invoker = true) AS
SELECT
  w.id AS workspace_id,
  w.name AS workspace_name,
  (date_trunc('day', pv.created_at))::date AS activity_date,
  COUNT(pv.id)::integer AS prompt_update_count
FROM public.workspaces AS w
JOIN public.prompts AS p
  ON p.workspace_id = w.id
JOIN public.prompt_versions AS pv
  ON pv.prompt_id = p.id
WHERE p.deleted_at IS NULL
GROUP BY
  w.id,
  w.name,
  (date_trunc('day', pv.created_at))::date;

GRANT SELECT ON public.workspace_prompt_activity_daily TO authenticated;
