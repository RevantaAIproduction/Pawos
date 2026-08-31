-- User legal document acceptance tracking
-- Records when a user accepts specific versions of PawOS legal documents

CREATE TABLE IF NOT EXISTS user_legal_acceptance (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  document_slug TEXT NOT NULL,
  document_version TEXT NOT NULL,
  accepted_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  user_agent TEXT,
  ip_address TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

-- Indexes for fast lookups
CREATE INDEX IF NOT EXISTS idx_user_legal_acceptance_user_id ON user_legal_acceptance(user_id);
CREATE INDEX IF NOT EXISTS idx_user_legal_acceptance_document ON user_legal_acceptance(document_slug, document_version);
CREATE INDEX IF NOT EXISTS idx_user_legal_acceptance_user_doc ON user_legal_acceptance(user_id, document_slug);

-- Enable RLS
ALTER TABLE user_legal_acceptance ENABLE ROW LEVEL SECURITY;

-- Users can only view their own acceptance records
CREATE POLICY "users_view_own_acceptance" ON user_legal_acceptance
  FOR SELECT
  USING (auth.uid() = user_id);

-- Users can only insert their own acceptance records
CREATE POLICY "users_insert_own_acceptance" ON user_legal_acceptance
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Service role (backend APIs) can view all acceptance records for account creation validation
-- This is handled via Supabase's service role key in API routes, not via RLS policies
