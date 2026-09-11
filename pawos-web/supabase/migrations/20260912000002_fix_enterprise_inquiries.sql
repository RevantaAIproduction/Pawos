-- Fix enterprise_inquiries table - add missing columns and RLS

-- Drop existing RLS policies (if they exist)
DROP POLICY IF EXISTS "Users can view their own inquiries" ON enterprise_inquiries;
DROP POLICY IF EXISTS "Users can insert their own inquiries" ON enterprise_inquiries;
DROP POLICY IF EXISTS "Admins can view all inquiries" ON enterprise_inquiries;
DROP POLICY IF EXISTS "Admins can update inquiries" ON enterprise_inquiries;

-- Disable RLS temporarily
ALTER TABLE enterprise_inquiries DISABLE ROW LEVEL SECURITY;

-- Add missing columns
ALTER TABLE enterprise_inquiries
ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
ADD COLUMN IF NOT EXISTS replied_at TIMESTAMP WITH TIME ZONE;

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_enterprise_inquiries_user_id ON enterprise_inquiries(user_id);
CREATE INDEX IF NOT EXISTS idx_enterprise_inquiries_email ON enterprise_inquiries(email);
CREATE INDEX IF NOT EXISTS idx_enterprise_inquiries_status ON enterprise_inquiries(status);
CREATE INDEX IF NOT EXISTS idx_enterprise_inquiries_created_at ON enterprise_inquiries(created_at DESC);

-- Enable RLS
ALTER TABLE enterprise_inquiries ENABLE ROW LEVEL SECURITY;

-- Create RLS policies
CREATE POLICY "Users can view their own inquiries"
  ON enterprise_inquiries FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own inquiries"
  ON enterprise_inquiries FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Admins can view all inquiries"
  ON enterprise_inquiries FOR SELECT
  USING (
    (SELECT email FROM auth.users WHERE id = auth.uid()) IN (
      'founder@revantaai.com',
      'admin@pawos.dev'
    )
  );

CREATE POLICY "Admins can update inquiries"
  ON enterprise_inquiries FOR UPDATE
  USING (
    (SELECT email FROM auth.users WHERE id = auth.uid()) IN (
      'founder@revantaai.com',
      'admin@pawos.dev'
    )
  );
