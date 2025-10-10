-- Demo users synced between auth.users and public.users with plan assignments
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
ON CONFLICT (id) DO NOTHING;

UPDATE auth.users AS u
SET
  email = s.email,
  aud = s.aud,
  role = s.role,
  email_confirmed_at = s.email_confirmed_at,
  invited_at = s.invited_at,
  created_at = s.created_at,
  updated_at = s.last_sign_in_at,
  last_sign_in_at = s.last_sign_in_at,
  raw_app_meta_data = s.raw_app_meta,
  raw_user_meta_data = s.raw_user_meta
FROM auth_user_seed s
WHERE u.id = s.id;

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
