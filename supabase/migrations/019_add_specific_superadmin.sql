-- Insert the owner of the specific organization as super admin
INSERT INTO super_admins (user_id)
SELECT id FROM staff 
WHERE organization_id = '75caf8f2-d8ce-4ef3-833f-ad968cb9ebf1' AND role = 'owner'
ON CONFLICT (user_id) DO NOTHING;
