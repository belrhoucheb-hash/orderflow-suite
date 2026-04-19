
-- Notifications table
CREATE TABLE public.notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  type text NOT NULL DEFAULT 'info',
  title text NOT NULL,
  message text NOT NULL,
  icon text DEFAULT 'bell',
  order_id uuid DEFAULT NULL,
  is_read boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  metadata jsonb DEFAULT '{}'::jsonb
);

-- Enable RLS
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

-- All authenticated users can read notifications
CREATE POLICY "Authenticated users can read notifications"
  ON public.notifications FOR SELECT TO authenticated
  USING (true);

-- Authenticated users can update (mark as read)
CREATE POLICY "Authenticated users can update notifications"
  ON public.notifications FOR UPDATE TO authenticated
  USING (true);

-- Authenticated users can insert notifications
CREATE POLICY "Authenticated users can insert notifications"
  ON public.notifications FOR INSERT TO authenticated
  WITH CHECK (true);

-- Authenticated users can delete notifications
CREATE POLICY "Authenticated users can delete notifications"
  ON public.notifications FOR DELETE TO authenticated
  USING (true);

-- Enable realtime for notifications
ALTER PUBLICATION supabase_realtime ADD TABLE public.notifications;
