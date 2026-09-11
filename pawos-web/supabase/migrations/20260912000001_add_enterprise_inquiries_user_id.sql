-- Add missing user_id column to enterprise_inquiries

ALTER TABLE enterprise_inquiries
ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE;

-- Create index on user_id
CREATE INDEX IF NOT EXISTS idx_enterprise_inquiries_user_id ON enterprise_inquiries(user_id);
