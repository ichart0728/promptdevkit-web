-- Dashboard activity summary seed
-- Provide recent prompt version activity so summary view has coverage across 7/30/90 day windows.
WITH version_seed AS (
  SELECT * FROM (
    VALUES
      (
        '8c1a9b70-4c0b-4f6b-a214-1c45d5c07f20'::uuid,
        '7f237e44-5af1-4a0d-9e6f-451a53a058de'::uuid,
        2,
        'Welcome Message Draft v2'::text,
        'Refine the onboarding greeting with a highlight on community guidelines.'::text,
        'Adds guidance for new members and counts toward 90-day activity.'::text,
        ARRAY['demo', 'activity', 'seed']::text[],
        '11111111-1111-4111-8111-111111111111'::uuid,
        NULL::integer,
        '2025-08-18 12:00:00+00'::timestamptz
      ),
      (
        'b1e7f1c5-754b-4de0-8c8b-3810f406b932'::uuid,
        '7f237e44-5af1-4a0d-9e6f-451a53a058de'::uuid,
        3,
        'Welcome Message Draft v3'::text,
        'Streamline the tone for returning users while retaining welcome context.'::text,
        'Mid-range iteration to drive 30-day activity metrics.'::text,
        ARRAY['demo', 'activity', 'seed']::text[],
        '11111111-1111-4111-8111-111111111111'::uuid,
        NULL::integer,
        '2025-10-05 09:40:00+00'::timestamptz
      ),
      (
        'c5f38b1d-2a6e-4bf4-9d43-16b0a0d2f883'::uuid,
        '7f237e44-5af1-4a0d-9e6f-451a53a058de'::uuid,
        4,
        'Welcome Message Draft v4'::text,
        'Call out the dashboard overview and prompt library highlights for newcomers.'::text,
        'Latest refresh to ensure 7-day activity stays visible in the summary.'::text,
        ARRAY['demo', 'activity', 'seed']::text[],
        '11111111-1111-4111-8111-111111111111'::uuid,
        NULL::integer,
        '2025-10-26 16:20:00+00'::timestamptz
      ),
      (
        'd2b4c781-2f6c-4d4b-8f43-b3e21bd41290'::uuid,
        'd2fd4052-6693-4aef-9f06-3c39b6f5ad93'::uuid,
        2,
        'Team Standup Template v2'::text,
        'Capture dependency updates and cross-team asks for the standup recap.'::text,
        'Extends the activity trail for the 90-day rollup window.'::text,
        ARRAY['team', 'activity', 'seed']::text[],
        '22222222-2222-4222-8222-222222222222'::uuid,
        NULL::integer,
        '2025-08-05 08:30:00+00'::timestamptz
      ),
      (
        'e33f9491-0f75-4bba-9541-0a0e422a4e10'::uuid,
        'd2fd4052-6693-4aef-9f06-3c39b6f5ad93'::uuid,
        3,
        'Team Standup Template v3'::text,
        'Add a section for demo readiness and risk tracking before releases.'::text,
        'Keeps 30-day workspace prompt activity populated.'::text,
        ARRAY['team', 'activity', 'seed']::text[],
        '22222222-2222-4222-8222-222222222222'::uuid,
        NULL::integer,
        '2025-09-28 10:45:00+00'::timestamptz
      ),
      (
        'f4a2b665-4ba0-4f3b-84a4-09afaa4c9f40'::uuid,
        'd2fd4052-6693-4aef-9f06-3c39b6f5ad93'::uuid,
        4,
        'Team Standup Template v4'::text,
        'Highlight the new dashboard metrics call-outs for the upcoming sprint.'::text,
        'Recent change to light up 7-day summary totals.'::text,
        ARRAY['team', 'activity', 'seed']::text[],
        '22222222-2222-4222-8222-222222222222'::uuid,
        NULL::integer,
        '2025-10-27 07:50:00+00'::timestamptz
      )
  ) AS t(
    id,
    prompt_id,
    version,
    title,
    body,
    note,
    tags,
    updated_by,
    restored_from_version,
    created_at
  )
)
INSERT INTO public.prompt_versions (
  id,
  prompt_id,
  version,
  title,
  body,
  note,
  tags,
  updated_by,
  restored_from_version,
  created_at
)
SELECT
  s.id,
  s.prompt_id,
  s.version,
  s.title,
  s.body,
  s.note,
  s.tags,
  s.updated_by,
  s.restored_from_version,
  s.created_at
FROM version_seed s
ON CONFLICT (id) DO UPDATE
SET
  version = EXCLUDED.version,
  title = EXCLUDED.title,
  body = EXCLUDED.body,
  note = EXCLUDED.note,
  tags = EXCLUDED.tags,
  updated_by = EXCLUDED.updated_by,
  restored_from_version = EXCLUDED.restored_from_version,
  created_at = EXCLUDED.created_at;
