INSERT INTO public.notifications (id, user_id, type, payload, read_at, created_at)
VALUES
  (
    '8a1f7f7c-6b8d-4f17-b4aa-6d6e9f13b101',
    '11111111-1111-4111-8111-111111111111',
    'system',
    jsonb_build_object(
      'title', 'Welcome to PromptDevKit',
      'message', 'Get started by exploring your personal workspace.',
      'action_url', '/dashboard'
    ),
    NULL,
    '2024-01-07 09:00:00+00'
  ),
  (
    'c13ac0a1-5a57-4b2c-a170-5fd2c86d9403',
    '11111111-1111-4111-8111-111111111111',
    'mention',
    jsonb_build_object(
      'title', 'Team Owner mentioned you',
      'message', 'Check the latest comment on the Prompt Builders HQ workspace.',
      'action_url', '/prompts/d2fd4052-6693-4aef-9f06-3c39b6f5ad93?thread=5f0ea629-9985-4d2a-8b8a-367a54a2cd01&comment=6bb3aa90-4d51-4b6c-a4e3-9196c7ee78bd',
      'prompt_id', 'd2fd4052-6693-4aef-9f06-3c39b6f5ad93',
      'thread_id', '5f0ea629-9985-4d2a-8b8a-367a54a2cd01',
      'comment_id', '6bb3aa90-4d51-4b6c-a4e3-9196c7ee78bd'
    ),
    '2024-01-08 11:30:00+00',
    '2024-01-08 11:00:00+00'
  ),
  (
    'e7b2db68-7813-4769-9323-9fd89a7c25d4',
    '22222222-2222-4222-8222-222222222222',
    'system',
    jsonb_build_object(
      'title', 'New team member joined',
      'message', 'Team Member has been added to Prompt Builders.',
      'action_url', '/teams'
    ),
    NULL,
    '2024-01-09 10:15:00+00'
  )
ON CONFLICT (id) DO UPDATE
SET
  user_id = EXCLUDED.user_id,
  type = EXCLUDED.type,
  payload = EXCLUDED.payload,
  read_at = EXCLUDED.read_at,
  created_at = EXCLUDED.created_at;

INSERT INTO public.notification_preferences (user_id, allow_mentions, updated_at)
VALUES
  (
    '11111111-1111-4111-8111-111111111111',
    true,
    '2024-01-15 10:05:00+00'
  ),
  (
    '22222222-2222-4222-8222-222222222222',
    true,
    '2024-01-16 10:05:00+00'
  ),
  (
    '33333333-3333-4333-8333-333333333333',
    true,
    '2024-01-16 11:05:00+00'
  )
ON CONFLICT (user_id) DO UPDATE
SET
  allow_mentions = EXCLUDED.allow_mentions,
  updated_at = EXCLUDED.updated_at;
