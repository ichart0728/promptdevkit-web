BEGIN;

ALTER TABLE public.notification_preferences
    ADD COLUMN IF NOT EXISTS digest_enabled boolean NOT NULL DEFAULT false,
    ADD COLUMN IF NOT EXISTS digest_hour_utc integer NOT NULL DEFAULT 9;

ALTER TABLE public.notification_preferences
    DROP CONSTRAINT IF EXISTS notification_preferences_digest_hour_utc_check;
ALTER TABLE public.notification_preferences
    ADD CONSTRAINT notification_preferences_digest_hour_utc_check
    CHECK (digest_hour_utc BETWEEN 0 AND 23);

COMMENT ON COLUMN public.notification_preferences.digest_enabled IS 'Whether daily digest emails are enabled.';
COMMENT ON COLUMN public.notification_preferences.digest_hour_utc IS 'Preferred hour in UTC to deliver the digest email.';

DROP FUNCTION IF EXISTS public.set_notification_preferences(boolean);

CREATE OR REPLACE FUNCTION public.set_notification_preferences(
    p_allow_mentions boolean DEFAULT NULL,
    p_digest_enabled boolean DEFAULT NULL,
    p_digest_hour_utc integer DEFAULT NULL
)
RETURNS public.notification_preferences
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
    v_user_id uuid := auth.uid();
    v_existing notification_preferences%ROWTYPE;
    v_result notification_preferences;
    v_allow_mentions boolean;
    v_digest_enabled boolean;
    v_digest_hour integer;
BEGIN
    IF v_user_id IS NULL THEN
        RAISE EXCEPTION 'auth.uid() is required to set notification preferences'
            USING ERRCODE = 'P0001';
    END IF;

    SELECT *
    INTO v_existing
    FROM public.notification_preferences
    WHERE user_id = v_user_id;

    v_allow_mentions := COALESCE(p_allow_mentions, COALESCE(v_existing.allow_mentions, true));
    v_digest_enabled := COALESCE(p_digest_enabled, COALESCE(v_existing.digest_enabled, false));
    v_digest_hour := COALESCE(p_digest_hour_utc, COALESCE(v_existing.digest_hour_utc, 9));

    IF v_digest_hour < 0 OR v_digest_hour > 23 THEN
        RAISE EXCEPTION 'digest_hour_utc must be between 0 and 23'
            USING ERRCODE = '22003';
    END IF;

    INSERT INTO public.notification_preferences AS np (
        user_id,
        allow_mentions,
        digest_enabled,
        digest_hour_utc
    )
    VALUES (
        v_user_id,
        v_allow_mentions,
        v_digest_enabled,
        v_digest_hour
    )
    ON CONFLICT (user_id) DO UPDATE
    SET allow_mentions = EXCLUDED.allow_mentions,
        digest_enabled = EXCLUDED.digest_enabled,
        digest_hour_utc = EXCLUDED.digest_hour_utc,
        updated_at = timezone('utc', now())
    RETURNING np.* INTO v_result;

    RETURN v_result;
END;
$$;

REVOKE ALL ON FUNCTION public.set_notification_preferences(boolean, boolean, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.set_notification_preferences(boolean, boolean, integer) TO authenticated;

COMMIT;
