INSERT INTO public.plans (id, name, is_active)
VALUES
  ('free', 'Free', true),
  ('pro', 'Pro', true)
ON CONFLICT (id) DO UPDATE
SET
  name = EXCLUDED.name,
  is_active = EXCLUDED.is_active;
