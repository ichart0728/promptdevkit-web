INSERT INTO public.notifications (id, user_id, type, payload, read_at, created_at)
VALUES
  (
    '8a1f7f7c-6b8d-4f17-b4aa-6d6e9f13b101',
    '11111111-1111-4111-8111-111111111111',
    'system',
    jsonb_build_object(
      'title', 'Welcome to PromptDevKit',
      'message', 'Get started by exploring your personal workspace.'
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
      'message', 'Check the latest comment on the Prompt Builders HQ workspace.'
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
      'message', 'Team Member has been added to Prompt Builders.'
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
