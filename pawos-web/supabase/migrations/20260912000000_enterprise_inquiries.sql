-- Enterprise Inquiries Table
-- Stores contact form submissions from potential Enterprise customers

CREATE TABLE IF NOT EXISTS enterprise_inquiries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  email TEXT NOT NULL,
  company TEXT NOT NULL,
  phone TEXT NOT NULL,
  seats_needed INTEGER NOT NULL CHECK (seats_needed >= 20),
  message TEXT,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'reviewed', 'approved', 'converted', 'rejected')),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  replied_at TIMESTAMP WITH TIME ZONE
);

-- Indexes for faster queries
CREATE INDEX IF NOT EXISTS idx_enterprise_inquiries_email ON enterprise_inquiries(email);
CREATE INDEX IF NOT EXISTS idx_enterprise_inquiries_status ON enterprise_inquiries(status);
CREATE INDEX IF NOT EXISTS idx_enterprise_inquiries_created_at ON enterprise_inquiries(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_enterprise_inquiries_user_id ON enterprise_inquiries(user_id);

-- RLS: Users can only see their own inquiries
ALTER TABLE enterprise_inquiries ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist
DROP POLICY IF EXISTS "Users can view their own inquiries" ON enterprise_inquiries;
DROP POLICY IF EXISTS "Users can insert their own inquiries" ON enterprise_inquiries;
DROP POLICY IF EXISTS "Admins can view all inquiries" ON enterprise_inquiries;
DROP POLICY IF EXISTS "Admins can update inquiries" ON enterprise_inquiries;

-- Create RLS policies
CREATE POLICY "Users can view their own inquiries"
  ON enterprise_inquiries FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own inquiries"
  ON enterprise_inquiries FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Admin policy: Admins (emails in admin_users) can view all inquiries
CREATE POLICY "Admins can view all inquiries"
  ON enterprise_inquiries FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM auth.users
      WHERE auth.users.id = auth.uid()
      AND auth.users.email IN (
        'founder@revantaai.com',
        'admin@pawos.dev'
      )
    )
  );

-- Admin policy: Admins can update inquiries
CREATE POLICY "Admins can update inquiries"
  ON enterprise_inquiries FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM auth.users
      WHERE auth.users.id = auth.uid()
      AND auth.users.email IN (
        'founder@revantaai.com',
        'admin@pawos.dev'
      )
    )
  );
