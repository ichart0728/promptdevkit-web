-- Demo workspaces, teams, and prompts linked to seeded users
WITH team_seed AS (
  SELECT * FROM (
    VALUES (
      '71dfe7c0-6b18-4f1f-b8e2-1e4677a2af11'::uuid,
      'Prompt Builders'::text,
      '22222222-2222-4222-8222-222222222222'::uuid,
      '2024-01-05 09:00:00+00'::timestamptz
    )
  ) AS t(id, name, created_by, created_at)
)
INSERT INTO public.teams (id, name, created_by, created_at)
SELECT
  s.id,
  s.name,
  s.created_by,
  s.created_at
FROM team_seed s
ON CONFLICT (id) DO UPDATE
SET
  name = EXCLUDED.name,
  created_by = EXCLUDED.created_by,
  created_at = EXCLUDED.created_at;

WITH member_seed AS (
  SELECT * FROM (
    VALUES
      (
        'a5d3bdc4-7f7d-4f63-8ab4-7c8285342f01'::uuid,
        '71dfe7c0-6b18-4f1f-b8e2-1e4677a2af11'::uuid,
        '22222222-2222-4222-8222-222222222222'::uuid,
        'admin'::team_member_role,
        '2024-01-05 09:05:00+00'::timestamptz
      ),
      (
        'b8f40392-9d48-4bd5-b18c-93383065dd53'::uuid,
        '71dfe7c0-6b18-4f1f-b8e2-1e4677a2af11'::uuid,
        '33333333-3333-4333-8333-333333333333'::uuid,
        'editor'::team_member_role,
        '2024-01-05 09:06:00+00'::timestamptz
      ),
      (
        'cc1abf3d-3c44-4b29-8b97-ea7e0f531bf4'::uuid,
        '71dfe7c0-6b18-4f1f-b8e2-1e4677a2af11'::uuid,
        '11111111-1111-4111-8111-111111111111'::uuid,
        'viewer'::team_member_role,
        '2024-01-05 09:07:00+00'::timestamptz
      )
  ) AS t(id, team_id, user_id, role, joined_at)
)
INSERT INTO public.team_members (id, team_id, user_id, role, joined_at)
SELECT
  s.id,
  s.team_id,
  s.user_id,
  s.role,
  s.joined_at
FROM member_seed s
ON CONFLICT (team_id, user_id) DO UPDATE
SET
  role = EXCLUDED.role,
  joined_at = EXCLUDED.joined_at;

-- membership activity
DELETE FROM public.team_membership_events
WHERE team_id = '71dfe7c0-6b18-4f1f-b8e2-1e4677a2af11'::uuid;

INSERT INTO public.team_membership_events (
  id,
  team_id,
  actor_user_id,
  target_user_id,
  event_type,
  previous_role,
  new_role,
  occurred_at
)
VALUES
  (
    'e8de6c6a-05de-41d8-8c4c-4f86f617d110'::uuid,
    '71dfe7c0-6b18-4f1f-b8e2-1e4677a2af11'::uuid,
    '22222222-2222-4222-8222-222222222222'::uuid,
    '33333333-3333-4333-8333-333333333333'::uuid,
    'member_added'::team_membership_event_type,
    NULL,
    'viewer'::team_member_role,
    '2024-01-05 09:06:15+00'::timestamptz
  ),
  (
    '9d4a58d8-8a6d-4a2c-8710-47acb1e013a8'::uuid,
    '71dfe7c0-6b18-4f1f-b8e2-1e4677a2af11'::uuid,
    '22222222-2222-4222-8222-222222222222'::uuid,
    '33333333-3333-4333-8333-333333333333'::uuid,
    'member_role_updated'::team_membership_event_type,
    'viewer'::team_member_role,
    'editor'::team_member_role,
    '2024-01-08 10:15:00+00'::timestamptz
  ),
  (
    '6bc36b64-9b98-4c64-9122-5f4b1a9280a9'::uuid,
    '71dfe7c0-6b18-4f1f-b8e2-1e4677a2af11'::uuid,
    '22222222-2222-4222-8222-222222222222'::uuid,
    '11111111-1111-4111-8111-111111111111'::uuid,
    'member_added'::team_membership_event_type,
    NULL,
    'viewer'::team_member_role,
    '2024-01-05 09:07:30+00'::timestamptz
  ),
  (
    'e3f6e403-6a5a-4f2c-aac0-dc3e0d84c8f4'::uuid,
    '71dfe7c0-6b18-4f1f-b8e2-1e4677a2af11'::uuid,
    '22222222-2222-4222-8222-222222222222'::uuid,
    '11111111-1111-4111-8111-111111111111'::uuid,
    'member_removed'::team_membership_event_type,
    'viewer'::team_member_role,
    NULL,
    '2024-01-20 12:00:00+00'::timestamptz
  ),
  (
    '5f1c2aa6-972e-4d5b-9f7f-6a2ed538c46a'::uuid,
    '71dfe7c0-6b18-4f1f-b8e2-1e4677a2af11'::uuid,
    '22222222-2222-4222-8222-222222222222'::uuid,
    '11111111-1111-4111-8111-111111111111'::uuid,
    'member_added'::team_membership_event_type,
    NULL,
    'viewer'::team_member_role,
    '2024-02-01 08:30:00+00'::timestamptz
  )
ON CONFLICT (id) DO UPDATE
SET
  team_id = EXCLUDED.team_id,
  actor_user_id = EXCLUDED.actor_user_id,
  target_user_id = EXCLUDED.target_user_id,
  event_type = EXCLUDED.event_type,
  previous_role = EXCLUDED.previous_role,
  new_role = EXCLUDED.new_role,
  occurred_at = EXCLUDED.occurred_at;

WITH workspace_seed AS (
  SELECT * FROM (
    VALUES
      (
        '0c93a3c6-7c5b-4f24-a413-2b142a4b6aaf'::uuid,
        'personal'::workspace_type,
        '11111111-1111-4111-8111-111111111111'::uuid,
        NULL::uuid,
        'Demo Personal Workspace'::text,
        '2024-01-05 09:10:00+00'::timestamptz
      ),
      (
        'c5b8f4d2-4d8c-4f2e-8f5d-199d6dbd6f90'::uuid,
        'team'::workspace_type,
        NULL::uuid,
        '71dfe7c0-6b18-4f1f-b8e2-1e4677a2af11'::uuid,
        'Prompt Builders HQ'::text,
        '2024-01-05 09:15:00+00'::timestamptz
      )
  ) AS t(id, type, owner_user_id, team_id, name, created_at)
)
INSERT INTO public.workspaces (id, type, owner_user_id, team_id, name, created_at)
SELECT
  s.id,
  s.type,
  s.owner_user_id,
  s.team_id,
  s.name,
  s.created_at
FROM workspace_seed s
ON CONFLICT (id) DO UPDATE
SET
  type = EXCLUDED.type,
  owner_user_id = EXCLUDED.owner_user_id,
  team_id = EXCLUDED.team_id,
  name = EXCLUDED.name,
  created_at = EXCLUDED.created_at;

WITH prompt_seed AS (
  SELECT * FROM (
    VALUES
      (
        '7f237e44-5af1-4a0d-9e6f-451a53a058de'::uuid,
        '0c93a3c6-7c5b-4f24-a413-2b142a4b6aaf'::uuid,
        'Welcome Message Draft'::text,
        'You are a friendly AI assistant welcoming new community members.'::text,
        'Personal workspace onboarding prompt'::text,
        ARRAY['demo', 'getting-started']::text[],
        '11111111-1111-4111-8111-111111111111'::uuid,
        '11111111-1111-4111-8111-111111111111'::uuid,
        '2024-01-06 10:00:00+00'::timestamptz,
        '2024-01-06 10:00:00+00'::timestamptz,
        NULL::timestamptz
      ),
      (
        'c17e3a45-90ef-4e3b-9c48-6f307b1ef6b1'::uuid,
        '0c93a3c6-7c5b-4f24-a413-2b142a4b6aaf'::uuid,
        'Daily Reflection Template'::text,
        'Guide teammates through a structured end-of-day reflection focused on wins and learnings.'::text,
        'Use this to capture personal highlights and blockers for tomorrow.'::text,
        ARRAY['reflection', 'daily']::text[],
        '11111111-1111-4111-8111-111111111111'::uuid,
        '11111111-1111-4111-8111-111111111111'::uuid,
        '2024-03-20 18:00:00+00'::timestamptz,
        '2024-03-25 09:30:00+00'::timestamptz,
        NULL::timestamptz
      ),
      (
        'd2fd4052-6693-4aef-9f06-3c39b6f5ad93'::uuid,
        'c5b8f4d2-4d8c-4f2e-8f5d-199d6dbd6f90'::uuid,
        'Team Standup Template'::text,
        'Summarize today\'s progress for the Prompt Builders team and highlight blockers.'::text,
        'Shared template for daily standups'::text,
        ARRAY['team', 'daily']::text[],
        '22222222-2222-4222-8222-222222222222'::uuid,
        '22222222-2222-4222-8222-222222222222'::uuid,
        '2024-01-06 11:00:00+00'::timestamptz,
        '2024-01-06 11:00:00+00'::timestamptz,
        NULL::timestamptz
      ),
      (
        '4a6d7c1e-0d0f-41d9-9d9b-8a2b0481212a'::uuid,
        '0c93a3c6-7c5b-4f24-a413-2b142a4b6aaf'::uuid,
        'Retired Personal Prompt'::text,
        'Legacy workflow prompt retained for reference.'::text,
        'Superseded by a newer prompt version'::text,
        ARRAY['archived', 'personal']::text[],
        '11111111-1111-4111-8111-111111111111'::uuid,
        '11111111-1111-4111-8111-111111111111'::uuid,
        '2024-01-10 08:30:00+00'::timestamptz,
        '2024-02-15 09:45:00+00'::timestamptz,
        '2024-03-15 12:00:00+00'::timestamptz
      ),
      (
        '8bf0f4c7-9a5d-477c-b4d4-fdf1e3c950f2'::uuid,
        'c5b8f4d2-4d8c-4f2e-8f5d-199d6dbd6f90'::uuid,
        'Deprecated Team Prompt'::text,
        'Outline an announcement for legacy features scheduled for removal.'::text,
        'Deprecated template stored in trash'::text,
        ARRAY['team', 'archived']::text[],
        '22222222-2222-4222-8222-222222222222'::uuid,
        '22222222-2222-4222-8222-222222222222'::uuid,
        '2024-01-12 14:00:00+00'::timestamptz,
        '2024-03-10 16:20:00+00'::timestamptz,
        '2024-03-18 08:30:00+00'::timestamptz
      ),
      (
        '1c5a68f0-39a0-4e83-bc75-2b9e529c1b9d'::uuid,
        'c5b8f4d2-4d8c-4f2e-8f5d-199d6dbd6f90'::uuid,
        'Product Update Broadcast'::text,
        'Share the latest product improvements with clear calls to action for customers.'::text,
        'Announce new features with crisp benefit statements and roll-out plans.'::text,
        ARRAY['team', 'announcement']::text[],
        '22222222-2222-4222-8222-222222222222'::uuid,
        '22222222-2222-4222-8222-222222222222'::uuid,
        '2024-03-22 09:00:00+00'::timestamptz,
        '2024-03-28 15:45:00+00'::timestamptz,
        NULL::timestamptz
      )
  ) AS t(
    id,
    workspace_id,
    title,
    body,
    note,
    tags,
    created_by,
    updated_by,
    created_at,
    updated_at,
    deleted_at
  )
)
INSERT INTO public.prompts (
  id,
  workspace_id,
  title,
  body,
  note,
  tags,
  created_by,
  updated_by,
  created_at,
  updated_at,
  deleted_at
)
SELECT
  s.id,
  s.workspace_id,
  s.title,
  s.body,
  s.note,
  s.tags,
  s.created_by,
  s.updated_by,
  s.created_at,
  s.updated_at,
  s.deleted_at
FROM prompt_seed s
ON CONFLICT (id) DO UPDATE
SET
  workspace_id = EXCLUDED.workspace_id,
  title = EXCLUDED.title,
  body = EXCLUDED.body,
  note = EXCLUDED.note,
  tags = EXCLUDED.tags,
  updated_by = EXCLUDED.updated_by,
  updated_at = EXCLUDED.updated_at,
  deleted_at = EXCLUDED.deleted_at;

