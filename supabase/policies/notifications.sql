-- RLS policies for public.notifications
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY select_notifications_for_owner
    ON public.notifications
    FOR SELECT
    TO authenticated
    USING (user_id = auth.uid());

CREATE POLICY update_notifications_for_owner
    ON public.notifications
    FOR UPDATE
    TO authenticated
    USING (user_id = auth.uid())
    WITH CHECK (user_id = auth.uid());

-- RLS policies for public.notification_preferences
ALTER TABLE public.notification_preferences ENABLE ROW LEVEL SECURITY;

CREATE POLICY select_notification_preferences_for_owner
    ON public.notification_preferences
    FOR SELECT
    TO authenticated
    USING (user_id = auth.uid());

CREATE POLICY insert_notification_preferences_for_owner
    ON public.notification_preferences
    FOR INSERT
    TO authenticated
    WITH CHECK (user_id = auth.uid());

CREATE POLICY update_notification_preferences_for_owner
    ON public.notification_preferences
    FOR UPDATE
    TO authenticated
    USING (user_id = auth.uid())
    WITH CHECK (user_id = auth.uid());

CREATE POLICY delete_notification_preferences_for_owner
    ON public.notification_preferences
    FOR DELETE
    TO authenticated
    USING (user_id = auth.uid());
