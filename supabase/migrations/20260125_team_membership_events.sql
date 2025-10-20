-- Create table and triggers to log team membership events

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_type WHERE typname = 'team_membership_event_type'
    ) THEN
        CREATE TYPE public.team_membership_event_type AS ENUM (
            'member_added',
            'member_role_updated',
            'member_removed',
            'member_left'
        );
    END IF;
END
$$;

CREATE TABLE IF NOT EXISTS public.team_membership_events (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    team_id uuid NOT NULL REFERENCES public.teams(id) ON DELETE CASCADE,
    actor_user_id uuid REFERENCES public.users(id) ON DELETE SET NULL,
    target_user_id uuid REFERENCES public.users(id) ON DELETE SET NULL,
    event_type public.team_membership_event_type NOT NULL,
    previous_role public.team_member_role,
    new_role public.team_member_role,
    occurred_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.team_membership_events IS 'Audit log of membership changes for a team.';

CREATE INDEX IF NOT EXISTS idx_team_membership_events_team_id_occurred_at
    ON public.team_membership_events (team_id, occurred_at DESC);

-- Trigger helpers
DROP FUNCTION IF EXISTS public.log_team_member_insert_event() CASCADE;
DROP FUNCTION IF EXISTS public.log_team_member_update_event() CASCADE;
DROP FUNCTION IF EXISTS public.log_team_member_delete_event() CASCADE;

CREATE OR REPLACE FUNCTION public.log_team_member_insert_event()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
    v_actor uuid := coalesce(auth.uid(), NEW.user_id);
BEGIN
    INSERT INTO public.team_membership_events (
        team_id,
        actor_user_id,
        target_user_id,
        event_type,
        previous_role,
        new_role,
        occurred_at
    )
    VALUES (
        NEW.team_id,
        v_actor,
        NEW.user_id,
        'member_added',
        NULL,
        NEW.role,
        now()
    );

    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.log_team_member_update_event()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
    v_actor uuid := coalesce(auth.uid(), NEW.user_id);
BEGIN
    IF NEW.role IS DISTINCT FROM OLD.role THEN
        INSERT INTO public.team_membership_events (
            team_id,
            actor_user_id,
            target_user_id,
            event_type,
            previous_role,
            new_role,
            occurred_at
        )
        VALUES (
            NEW.team_id,
            v_actor,
            NEW.user_id,
            'member_role_updated',
            OLD.role,
            NEW.role,
            now()
        );
    END IF;

    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.log_team_member_delete_event()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
    v_actor uuid := coalesce(auth.uid(), OLD.user_id);
    v_event_type public.team_membership_event_type :=
        CASE
            WHEN v_actor = OLD.user_id THEN 'member_left'
            ELSE 'member_removed'
        END;
BEGIN
    INSERT INTO public.team_membership_events (
        team_id,
        actor_user_id,
        target_user_id,
        event_type,
        previous_role,
        new_role,
        occurred_at
    )
    VALUES (
        OLD.team_id,
        v_actor,
        OLD.user_id,
        v_event_type,
        OLD.role,
        NULL,
        now()
    );

    RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS team_member_insert_event ON public.team_members;
DROP TRIGGER IF EXISTS team_member_update_event ON public.team_members;
DROP TRIGGER IF EXISTS team_member_delete_event ON public.team_members;

CREATE TRIGGER team_member_insert_event
AFTER INSERT ON public.team_members
FOR EACH ROW
EXECUTE FUNCTION public.log_team_member_insert_event();

CREATE TRIGGER team_member_update_event
AFTER UPDATE ON public.team_members
FOR EACH ROW
EXECUTE FUNCTION public.log_team_member_update_event();

CREATE TRIGGER team_member_delete_event
AFTER DELETE ON public.team_members
FOR EACH ROW
EXECUTE FUNCTION public.log_team_member_delete_event();

ALTER TABLE public.team_membership_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS select_team_membership_events_for_members ON public.team_membership_events;
CREATE POLICY select_team_membership_events_for_members
    ON public.team_membership_events
    FOR SELECT
    TO authenticated
    USING (
        EXISTS (
            SELECT 1
            FROM public.team_members tm
            WHERE tm.team_id = public.team_membership_events.team_id
              AND tm.user_id = auth.uid()
        )
    );

DROP POLICY IF EXISTS insert_team_membership_events_for_members ON public.team_membership_events;
CREATE POLICY insert_team_membership_events_for_members
    ON public.team_membership_events
    FOR INSERT
    TO authenticated
    WITH CHECK (
        EXISTS (
            SELECT 1
            FROM public.team_members tm
            WHERE tm.team_id = public.team_membership_events.team_id
              AND tm.user_id = auth.uid()
        )
    );

DROP VIEW IF EXISTS public.team_membership_event_feed;

CREATE VIEW public.team_membership_event_feed
WITH (security_invoker = true) AS
SELECT
    e.id,
    e.team_id,
    e.event_type,
    e.actor_user_id,
    actor.email AS actor_email,
    actor.name AS actor_name,
    actor.avatar_url AS actor_avatar_url,
    e.target_user_id,
    target.email AS target_email,
    target.name AS target_name,
    target.avatar_url AS target_avatar_url,
    e.previous_role,
    e.new_role,
    e.occurred_at
FROM public.team_membership_events e
LEFT JOIN public.users actor
    ON actor.id = e.actor_user_id
LEFT JOIN public.users target
    ON target.id = e.target_user_id;

COMMENT ON VIEW public.team_membership_event_feed
    IS 'Flattened team membership activity entries with actor and target metadata.';

GRANT SELECT ON public.team_membership_events TO authenticated;
GRANT SELECT ON public.team_membership_event_feed TO authenticated;
