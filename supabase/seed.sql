-- NOTE: Supabase CLI executes this file directly via the Postgres server, so
-- psql meta-commands like "\\i" are not supported here. Consolidate the seed
-- statements from the individual files instead.

-- Source: seed/001_plans.sql
INSERT INTO public.plans (id, name, is_active)
VALUES
  ('free', 'Free', true),
  ('pro', 'Pro', true)
ON CONFLICT (id) DO UPDATE
SET
  name = EXCLUDED.name,
  is_active = EXCLUDED.is_active;

-- Source: seed/002_plan_limits.sql
INSERT INTO public.plan_limits (plan_id, key, value_int, note)
VALUES
  ('free', 'personal_workspaces', 1, '個人ワークスペースは1つまで'),
  ('free', 'team_workspaces', 0, 'FREEではチームワークスペースを作成不可'),
  ('free', 'members_per_team', 3, 'チーム機能が有効になった際の想定上限'),
  ('free', 'prompts_per_personal_ws', 20, '個人ワークスペース内のプロンプト数'),
  ('free', 'prompts_per_team_ws', 0, 'チームワークスペースが無いため0件'),
  ('free', 'prompt_versions_per_prompt', 10, 'バージョン履歴の最大数'),
  ('free', 'comment_threads_per_prompt', 5, '1プロンプト当たりのスレッド数'),
  ('free', 'comments_per_thread', 50, '1スレッド当たりのコメント数'),
  ('free', 'favorites_per_user', 50, 'お気に入り登録の上限'),
  ('pro', 'personal_workspaces', 10, '個人ワークスペース最大数'),
  ('pro', 'team_workspaces', 10, 'チームワークスペース最大数'),
  ('pro', 'members_per_team', 50, 'チームメンバーの上限'),
  ('pro', 'prompts_per_personal_ws', 1000, '個人ワークスペース内のプロンプト数'),
  ('pro', 'prompts_per_team_ws', 2000, 'チームワークスペース内のプロンプト数'),
  ('pro', 'prompt_versions_per_prompt', 100, 'バージョン履歴の最大数'),
  ('pro', 'comment_threads_per_prompt', 100, '1プロンプト当たりのスレッド数'),
  ('pro', 'comments_per_thread', 1000, '1スレッド当たりのコメント数'),
  ('pro', 'favorites_per_user', 500, 'お気に入り登録の上限')
ON CONFLICT (plan_id, key) DO UPDATE
SET
  value_int = EXCLUDED.value_int,
  note = EXCLUDED.note;

-- Source: seed/003_demo_users.sql
-- Ensure auth and public user records stay aligned with demo plans
WITH auth_user_seed AS (
  SELECT * FROM (
    VALUES
      (
        '11111111-1111-4111-8111-111111111111'::uuid,
        'demo.user@example.com'::text,
        'DemoPass123!'::text,
        'authenticated'::text,
        'authenticated'::text,
        '2024-01-02 09:00:00+00'::timestamptz,
        '2024-01-01 08:30:00+00'::timestamptz,
        '2024-01-01 08:30:00+00'::timestamptz,
        '2024-01-15 10:00:00+00'::timestamptz,
        jsonb_build_object('provider', 'email', 'providers', ARRAY['email']),
        jsonb_build_object('name', 'Demo User')
      ),
      (
        '22222222-2222-4222-8222-222222222222'::uuid,
        'team.owner@example.com'::text,
        'DemoPass123!'::text,
        'authenticated'::text,
        'authenticated'::text,
        '2024-01-02 09:10:00+00'::timestamptz,
        '2024-01-01 08:40:00+00'::timestamptz,
        '2024-01-01 08:40:00+00'::timestamptz,
        '2024-01-16 10:00:00+00'::timestamptz,
        jsonb_build_object('provider', 'email', 'providers', ARRAY['email']),
        jsonb_build_object('name', 'Team Owner')
      ),
      (
        '33333333-3333-4333-8333-333333333333'::uuid,
        'team.member@example.com'::text,
        'DemoPass123!'::text,
        'authenticated'::text,
        'authenticated'::text,
        '2024-01-02 09:20:00+00'::timestamptz,
        '2024-01-01 08:50:00+00'::timestamptz,
        '2024-01-01 08:50:00+00'::timestamptz,
        '2024-01-16 11:00:00+00'::timestamptz,
        jsonb_build_object('provider', 'email', 'providers', ARRAY['email']),
        jsonb_build_object('name', 'Team Member')
      )

  ) AS t(
    id,
    email,
    password,
    aud,
    role,
    email_confirmed_at,
    invited_at,
    created_at,
    last_sign_in_at,
    raw_app_meta,
    raw_user_meta
  )
)
INSERT INTO auth.users (
  id,
  instance_id,
  aud,
  role,
  email,
  encrypted_password,
  email_confirmed_at,
  invited_at,
  created_at,
  updated_at,
  last_sign_in_at,
  raw_app_meta_data,
  raw_user_meta_data,
  is_super_admin
)
SELECT
  s.id,
  '00000000-0000-0000-0000-000000000000'::uuid,
  s.aud,
  s.role,
  s.email,
  crypt(s.password, gen_salt('bf')),
  s.email_confirmed_at,
  s.invited_at,
  s.created_at,
  s.last_sign_in_at,
  s.last_sign_in_at,
  s.raw_app_meta,
  s.raw_user_meta,
  false
FROM auth_user_seed s
ON CONFLICT (id) DO UPDATE
SET
  instance_id = EXCLUDED.instance_id,
  aud = EXCLUDED.aud,
  role = EXCLUDED.role,
  email = EXCLUDED.email,
  encrypted_password = EXCLUDED.encrypted_password,
  email_confirmed_at = EXCLUDED.email_confirmed_at,
  invited_at = EXCLUDED.invited_at,
  created_at = EXCLUDED.created_at,
  updated_at = EXCLUDED.updated_at,
  last_sign_in_at = EXCLUDED.last_sign_in_at,
  raw_app_meta_data = EXCLUDED.raw_app_meta_data,
  raw_user_meta_data = EXCLUDED.raw_user_meta_data,
  is_super_admin = EXCLUDED.is_super_admin;

WITH auth_user_seed AS (
  SELECT * FROM (
    VALUES
      (
        '11111111-1111-4111-8111-111111111111'::uuid,
        'demo.user@example.com'::text,
        'DemoPass123!'::text,
        'authenticated'::text,
        'authenticated'::text,
        '2024-01-02 09:00:00+00'::timestamptz,
        '2024-01-01 08:30:00+00'::timestamptz,
        '2024-01-01 08:30:00+00'::timestamptz,
        '2024-01-15 10:00:00+00'::timestamptz,
        jsonb_build_object('provider', 'email', 'providers', ARRAY['email']),
        jsonb_build_object('name', 'Demo User')
      ),
      (
        '22222222-2222-4222-8222-222222222222'::uuid,
        'team.owner@example.com'::text,
        'DemoPass123!'::text,
        'authenticated'::text,
        'authenticated'::text,
        '2024-01-02 09:10:00+00'::timestamptz,
        '2024-01-01 08:40:00+00'::timestamptz,
        '2024-01-01 08:40:00+00'::timestamptz,
        '2024-01-16 10:00:00+00'::timestamptz,
        jsonb_build_object('provider', 'email', 'providers', ARRAY['email']),
        jsonb_build_object('name', 'Team Owner')
      ),
      (
        '33333333-3333-4333-8333-333333333333'::uuid,
        'team.member@example.com'::text,
        'DemoPass123!'::text,
        'authenticated'::text,
        'authenticated'::text,
        '2024-01-02 09:20:00+00'::timestamptz,
        '2024-01-01 08:50:00+00'::timestamptz,
        '2024-01-01 08:50:00+00'::timestamptz,
        '2024-01-16 11:00:00+00'::timestamptz,
        jsonb_build_object('provider', 'email', 'providers', ARRAY['email']),
        jsonb_build_object('name', 'Team Member')
      )

  ) AS t(
    id,
    email,
    password,
    aud,
    role,
    email_confirmed_at,
    invited_at,
    created_at,
    last_sign_in_at,
    raw_app_meta,
    raw_user_meta
  )
)
INSERT INTO auth.identities (
  provider_id,
  user_id,
  identity_data,
  provider,
  last_sign_in_at,
  created_at,
  updated_at
)
SELECT
  s.email,
  s.id,
  jsonb_build_object('sub', s.id::text, 'email', s.email),
  'email',
  s.last_sign_in_at,
  s.created_at,
  s.last_sign_in_at
FROM auth_user_seed s
ON CONFLICT (provider, provider_id) DO UPDATE
SET
  user_id = EXCLUDED.user_id,
  identity_data = EXCLUDED.identity_data,
  last_sign_in_at = EXCLUDED.last_sign_in_at,
  updated_at = EXCLUDED.updated_at;

WITH user_seed AS (
  SELECT * FROM (
    VALUES
      (
        '11111111-1111-4111-8111-111111111111'::uuid,
        'demo.user@example.com'::text,
        'Demo User'::text,
        'https://avatars.dicebear.com/api/initials/Demo%20User.svg'::text,
        '2024-01-01 08:35:00+00'::timestamptz,
        '2024-01-15 10:05:00+00'::timestamptz,
        'free'::text
      ),
      (
        '22222222-2222-4222-8222-222222222222'::uuid,
        'team.owner@example.com'::text,
        'Team Owner'::text,
        'https://avatars.dicebear.com/api/initials/Team%20Owner.svg'::text,
        '2024-01-01 08:45:00+00'::timestamptz,
        '2024-01-16 10:05:00+00'::timestamptz,
        'pro'::text
      ),
      (
        '33333333-3333-4333-8333-333333333333'::uuid,
        'team.member@example.com'::text,
        'Team Member'::text,
        'https://avatars.dicebear.com/api/initials/Team%20Member.svg'::text,
        '2024-01-01 08:55:00+00'::timestamptz,
        '2024-01-16 11:05:00+00'::timestamptz,
        'free'::text
      )

  ) AS t(
    id,
    email,
    name,
    avatar_url,
    created_at,
    updated_at,
    plan_id
  )
)
INSERT INTO public.users (id, email, name, avatar_url, created_at, updated_at)
SELECT
  s.id,
  s.email,
  s.name,
  s.avatar_url,
  s.created_at,
  s.updated_at
FROM user_seed s
ON CONFLICT (id) DO UPDATE
SET
  email = EXCLUDED.email,
  name = EXCLUDED.name,
  avatar_url = EXCLUDED.avatar_url,
  updated_at = EXCLUDED.updated_at;

WITH user_seed AS (
  SELECT * FROM (
    VALUES
      (
        '11111111-1111-4111-8111-111111111111'::uuid,
        'demo.user@example.com'::text,
        'Demo User'::text,
        'https://avatars.dicebear.com/api/initials/Demo%20User.svg'::text,
        '2024-01-01 08:35:00+00'::timestamptz,
        '2024-01-15 10:05:00+00'::timestamptz,
        'free'::text
      ),
      (
        '22222222-2222-4222-8222-222222222222'::uuid,
        'team.owner@example.com'::text,
        'Team Owner'::text,
        'https://avatars.dicebear.com/api/initials/Team%20Owner.svg'::text,
        '2024-01-01 08:45:00+00'::timestamptz,
        '2024-01-16 10:05:00+00'::timestamptz,
        'pro'::text
      ),
      (
        '33333333-3333-4333-8333-333333333333'::uuid,
        'team.member@example.com'::text,
        'Team Member'::text,
        'https://avatars.dicebear.com/api/initials/Team%20Member.svg'::text,
        '2024-01-01 08:55:00+00'::timestamptz,
        '2024-01-16 11:05:00+00'::timestamptz,
        'free'::text
      )

  ) AS t(
    id,
    email,
    name,
    avatar_url,
    created_at,
    updated_at,
    plan_id
  )
)
INSERT INTO public.user_plans (user_id, plan_id, started_at)
SELECT
  s.id,
  s.plan_id,
  '2024-01-01 09:00:00+00'::timestamptz
FROM user_seed s
ON CONFLICT (user_id) DO UPDATE
SET
  plan_id = EXCLUDED.plan_id,
  started_at = EXCLUDED.started_at;

-- Source: seed/004_demo_workspaces.sql
-- Provide a personal workspace and a collaborative team setup with prompts
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
        'd2fd4052-6693-4aef-9f06-3c39b6f5ad93'::uuid,
        'c5b8f4d2-4d8c-4f2e-8f5d-199d6dbd6f90'::uuid,
        'Team Standup Template'::text,
        'Summarize today''s progress for the Prompt Builders team and highlight blockers.'::text,
        'Shared template for daily standups'::text,
        ARRAY['team', 'daily']::text[],
        '22222222-2222-4222-8222-222222222222'::uuid,
        '22222222-2222-4222-8222-222222222222'::uuid,
        '2024-01-06 11:00:00+00'::timestamptz,
        '2024-01-06 11:00:00+00'::timestamptz,
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

WITH version_seed AS (
  SELECT * FROM (
    VALUES
      (
        '6df8c5c7-1fef-4d4c-9347-91cbd5c96f16'::uuid,
        '7f237e44-5af1-4a0d-9e6f-451a53a058de'::uuid,
        1,
        'Welcome Message Draft'::text,
        'You are a friendly AI assistant welcoming new community members.'::text,
        'Personal workspace onboarding prompt'::text,
        ARRAY['demo', 'getting-started']::text[],
        '11111111-1111-4111-8111-111111111111'::uuid,
        NULL::integer,
        '2024-01-06 10:00:00+00'::timestamptz
      ),
      (
        '74c2f37e-4b2a-4a92-9c7d-a9f1cefc3d6e'::uuid,
        'd2fd4052-6693-4aef-9f06-3c39b6f5ad93'::uuid,
        1,
        'Team Standup Template'::text,
        'Summarize today''s progress for the Prompt Builders team and highlight blockers.'::text,
        'Shared template for daily standups'::text,
        ARRAY['team', 'daily']::text[],
        '22222222-2222-4222-8222-222222222222'::uuid,
        NULL::integer,
        '2024-01-06 11:00:00+00'::timestamptz
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
ON CONFLICT (prompt_id, version) DO UPDATE
SET
  title = EXCLUDED.title,
  body = EXCLUDED.body,
  note = EXCLUDED.note,
  tags = EXCLUDED.tags,
  updated_by = EXCLUDED.updated_by,
  restored_from_version = EXCLUDED.restored_from_version,
  created_at = EXCLUDED.created_at;
