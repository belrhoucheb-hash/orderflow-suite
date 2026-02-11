
-- Create the email-attachments storage bucket (public)
INSERT INTO storage.buckets (id, name, public)
VALUES ('email-attachments', 'email-attachments', true);

-- Allow public read access
CREATE POLICY "Public read access for email attachments"
ON storage.objects FOR SELECT
USING (bucket_id = 'email-attachments');

-- Allow authenticated uploads
CREATE POLICY "Authenticated users can upload email attachments"
ON storage.objects FOR INSERT
WITH CHECK (bucket_id = 'email-attachments');

-- Allow authenticated updates
CREATE POLICY "Authenticated users can update email attachments"
ON storage.objects FOR UPDATE
USING (bucket_id = 'email-attachments');

-- Allow authenticated deletes
CREATE POLICY "Authenticated users can delete email attachments"
ON storage.objects FOR DELETE
USING (bucket_id = 'email-attachments');
