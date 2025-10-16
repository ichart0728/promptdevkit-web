-- Create table to store per-user notification preferences
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

-- Helper RPC for authenticated users to upsert their preferences
CREATE OR REPLACE FUNCTION public.set_notification_preferences(p_allow_mentions boolean)
RETURNS public.notification_preferences
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
    v_user_id uuid := auth.uid();
BEGIN
    IF v_user_id IS NULL THEN
        RAISE EXCEPTION 'auth.uid() is required to set notification preferences'
            USING ERRCODE = 'P0001';
    END IF;

    RETURN (
        INSERT INTO public.notification_preferences AS np (user_id, allow_mentions)
        VALUES (v_user_id, COALESCE(p_allow_mentions, true))
        ON CONFLICT (user_id) DO UPDATE
        SET allow_mentions = EXCLUDED.allow_mentions,
            updated_at = timezone('utc', now())
        RETURNING np.*
    );
END;
$$;

REVOKE ALL ON FUNCTION public.set_notification_preferences(boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.set_notification_preferences(boolean) TO authenticated;
