-- Create table and RLS policies for per-user notification preferences
CREATE TABLE IF NOT EXISTS public.notification_preferences (
    user_id uuid PRIMARY KEY REFERENCES auth.users (id) ON DELETE CASCADE,
    allow_mentions boolean NOT NULL DEFAULT true,
    updated_at timestamptz NOT NULL DEFAULT timezone('utc', now())
);

COMMENT ON TABLE public.notification_preferences IS 'Per-user notification preferences to control notification delivery.';
COMMENT ON COLUMN public.notification_preferences.allow_mentions IS 'Whether the user allows mention notifications.';

-- Ensure updated_at reflects the latest change when records are modified
CREATE OR REPLACE FUNCTION public.touch_notification_preferences()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
    NEW.updated_at := timezone('utc', now());
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS set_notification_preferences_updated_at ON public.notification_preferences;
CREATE TRIGGER set_notification_preferences_updated_at
    BEFORE UPDATE ON public.notification_preferences
    FOR EACH ROW
    EXECUTE FUNCTION public.touch_notification_preferences();

-- Enforce per-user access control
ALTER TABLE public.notification_preferences ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS select_own_notification_preferences ON public.notification_preferences;
CREATE POLICY select_own_notification_preferences
    ON public.notification_preferences
    FOR SELECT
    USING (auth.uid() = user_id);

DROP POLICY IF EXISTS insert_own_notification_preferences ON public.notification_preferences;
CREATE POLICY insert_own_notification_preferences
    ON public.notification_preferences
    FOR INSERT
    WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS update_own_notification_preferences ON public.notification_preferences;
CREATE POLICY update_own_notification_preferences
    ON public.notification_preferences
    FOR UPDATE
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);

GRANT SELECT, INSERT, UPDATE ON public.notification_preferences TO authenticated;

-- Helper RPC for authenticated users to upsert their preferences
CREATE OR REPLACE FUNCTION public.set_notification_preferences(p_allow_mentions boolean)
RETURNS public.notification_preferences
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
    v_user_id uuid := auth.uid();
    v_result public.notification_preferences%ROWTYPE;
BEGIN
    IF v_user_id IS NULL THEN
        RAISE EXCEPTION 'auth.uid() is required to set notification preferences'
        USING ERRCODE = 'P0001';
    END IF;

    INSERT INTO public.notification_preferences AS np (user_id, allow_mentions)
    VALUES (v_user_id, COALESCE(p_allow_mentions, true))
    ON CONFLICT (user_id) DO UPDATE
    SET allow_mentions = EXCLUDED.allow_mentions,
        updated_at     = timezone('utc', now())
    RETURNING np.* INTO v_result;

    RETURN v_result;
END;
$$;

REVOKE ALL ON FUNCTION public.set_notification_preferences(boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.set_notification_preferences(boolean) TO authenticated;
