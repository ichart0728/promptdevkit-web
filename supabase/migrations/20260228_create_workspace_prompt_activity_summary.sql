-- Workspace prompt activity summary view aggregating 7/30/90 day windows
DROP VIEW IF EXISTS public.workspace_prompt_activity_summary;

CREATE VIEW public.workspace_prompt_activity_summary
WITH (security_invoker = true) AS
WITH recent_activity AS (
  SELECT
    d.workspace_id,
    d.activity_date,
    d.total_count
  FROM public.workspace_prompt_activity_daily AS d
  -- CURRENT_DATE bound ensures we only roll up recent activity windows
  WHERE d.activity_date >= CURRENT_DATE - INTERVAL '89 days'
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
  FROM recent_activity
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
