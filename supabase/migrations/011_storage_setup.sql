-- Create a new bucket for storing product and ingredient images
INSERT INTO storage.buckets (id, name, public) 
VALUES ('images', 'images', true)
ON CONFLICT (id) DO NOTHING;

-- Set up row level security for the storage bucket 'images'
-- Note: 'storage.objects' is where the actual files are stored
CREATE POLICY "Public Access" 
ON storage.objects FOR SELECT 
USING ( bucket_id = 'images' );

CREATE POLICY "Enable authenticated users to insert"
ON storage.objects FOR INSERT 
WITH CHECK ( bucket_id = 'images' AND auth.role() = 'authenticated' );

CREATE POLICY "Enable authenticated users to update"
ON storage.objects FOR UPDATE 
USING ( bucket_id = 'images' AND auth.role() = 'authenticated' );

CREATE POLICY "Enable authenticated users to delete"
ON storage.objects FOR DELETE 
USING ( bucket_id = 'images' AND auth.role() = 'authenticated' );

-- Add image_url column to ingredients if it doesn't exist
ALTER TABLE ingredients ADD COLUMN IF NOT EXISTS image_url TEXT;
