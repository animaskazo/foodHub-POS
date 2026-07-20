CREATE TABLE IF NOT EXISTS app_feedback (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    organization_id UUID REFERENCES organizations(id),
    created_by UUID REFERENCES auth.users(id),
    description TEXT NOT NULL,
    image_url TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);

-- Enable RLS
ALTER TABLE app_feedback ENABLE ROW LEVEL SECURITY;

-- Allow super admins to view all feedback
CREATE POLICY "Super admins can view all feedback" ON app_feedback
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM super_admins WHERE user_id = auth.uid()
        )
    );

-- Allow authenticated users to insert feedback
CREATE POLICY "Authenticated users can insert feedback" ON app_feedback
    FOR INSERT WITH CHECK (
        auth.role() = 'authenticated'
    );
