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
