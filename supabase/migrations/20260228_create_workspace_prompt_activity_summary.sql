-- Workspace prompt activity summary view aggregating 7/30/90 day windows
DROP VIEW IF EXISTS public.workspace_prompt_activity_summary;

CREATE VIEW public.workspace_prompt_activity_summary
WITH (security_invoker = true) AS
WITH activity_events AS (
  -- Prompt version publishes capture prompt creation + edits
  SELECT
    p.workspace_id,
    DATE_TRUNC('day', pv.created_at)::date AS activity_date
  FROM public.prompt_versions AS pv
  JOIN public.prompts AS p
    ON p.id = pv.prompt_id
  WHERE pv.created_at >= CURRENT_DATE - INTERVAL '89 days'

  UNION ALL

  -- Comment posts contribute to workspace prompt activity as well
  SELECT
    p.workspace_id,
    DATE_TRUNC('day', c.created_at)::date AS activity_date
  FROM public.comments AS c
  JOIN public.comment_threads AS ct
    ON ct.id = c.thread_id
  JOIN public.prompts AS p
    ON p.id = ct.prompt_id
  WHERE c.deleted_at IS NULL
    AND c.created_at >= CURRENT_DATE - INTERVAL '89 days'
),
daily_activity AS (
  SELECT
    workspace_id,
    activity_date,
    COUNT(*) AS total_count
  FROM activity_events
  GROUP BY workspace_id, activity_date
),
rollups AS (
  SELECT
    workspace_id,
    SUM(total_count) FILTER (
      WHERE activity_date >= CURRENT_DATE - INTERVAL '6 days'
    ) AS total_7d,
    SUM(total_count) FILTER (
      WHERE activity_date >= CURRENT_DATE - INTERVAL '29 days'
    ) AS total_30d,
    SUM(total_count) AS total_90d
  FROM daily_activity
  GROUP BY workspace_id
)
SELECT workspace_id, '7d'::text AS range, COALESCE(total_7d, 0)::bigint AS total_count
FROM rollups
UNION ALL
SELECT workspace_id, '30d'::text AS range, COALESCE(total_30d, 0)::bigint AS total_count
FROM rollups
UNION ALL
SELECT workspace_id, '90d'::text AS range, COALESCE(total_90d, 0)::bigint AS total_count
FROM rollups;
