-- Billing case tracking for high-value Team/Enterprise orders
-- Created for internal PawOS admin case management

CREATE TABLE IF NOT EXISTS billing_cases (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  customer_name TEXT NOT NULL,
  billing_email TEXT NOT NULL,
  organization_id UUID REFERENCES organizations(id) ON DELETE SET NULL,
  organization_name TEXT,

  -- Billing details
  tier TEXT NOT NULL CHECK (tier IN ('team', 'enterprise', 'credit-purchase')),
  plan TEXT, -- 'standard' or 'premium' for team
  member_count INTEGER NOT NULL DEFAULT 1,
  normal_credit_amount NUMERIC(10,2),
  autonomous_ticket_amount NUMERIC(10,2),

  -- Pricing
  usd_total NUMERIC(10,2) NOT NULL,
  inr_total INTEGER NOT NULL,
  gst_percent NUMERIC(5,2),

  -- Invoices
  invoice_count INTEGER NOT NULL DEFAULT 0,
  invoice_ids TEXT[], -- Razorpay invoice IDs
  invoice_amounts INTEGER[], -- amounts in INR
  invoice_urls TEXT[], -- short_url from Razorpay
  invoice_statuses TEXT[], -- 'issued', 'paid', 'expired', etc.

  -- Payment & validation
  payment_status TEXT DEFAULT 'pending' CHECK (payment_status IN ('pending', 'received', 'verified', 'rejected')),
  razorpay_webhook_status TEXT, -- 'received', 'processed', 'error'
  validation_status TEXT DEFAULT 'awaiting_review' CHECK (validation_status IN ('awaiting_review', 'verified', 'approved', 'rejected')),

  -- Support & admin
  assigned_persona TEXT, -- persona name from SupportPersonas pool
  conversation_id TEXT, -- link to support chat session

  -- Admin review
  reviewed_by_email TEXT, -- one of: founder@revantaai.com, pawos@revantaai.com, tharun@revantaai.com
  reviewed_at TIMESTAMP,
  decision TEXT CHECK (decision IN ('approved', 'rejected', NULL)),
  rejection_reason TEXT,

  -- Metadata
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),

  CONSTRAINT valid_admin_only CHECK (
    reviewed_by_email IS NULL
    OR reviewed_by_email IN ('founder@revantaai.com', 'pawos@revantaai.com', 'tharun@revantaai.com')
  )
);

-- RLS: Users can only view their own cases
ALTER TABLE billing_cases ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view own cases"
  ON billing_cases FOR SELECT
  USING (auth.uid() = user_id);

-- Admin access: any of the three authorized admins
CREATE POLICY "Admins access all cases"
  ON billing_cases FOR SELECT
  USING (
    auth.jwt() ->> 'email' IN ('founder@revantaai.com', 'pawos@revantaai.com', 'tharun@revantaai.com')
  );

-- Update access: only authorized admins
CREATE POLICY "Admins update cases"
  ON billing_cases FOR UPDATE
  USING (
    auth.jwt() ->> 'email' IN ('founder@revantaai.com', 'pawos@revantaai.com', 'tharun@revantaai.com')
  );

-- Create index for faster lookups
CREATE INDEX idx_billing_cases_user_id ON billing_cases(user_id);
CREATE INDEX idx_billing_cases_email ON billing_cases(billing_email);
CREATE INDEX idx_billing_cases_validation_status ON billing_cases(validation_status);

-- Support session persistence for normal chat support personas
CREATE TABLE IF NOT EXISTS support_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  conversation_id TEXT NOT NULL,
  assigned_persona TEXT NOT NULL,
  session_status TEXT DEFAULT 'active' CHECK (session_status IN ('active', 'completed', 'closed')),
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(user_id, conversation_id)
);

ALTER TABLE support_sessions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view own support sessions"
  ON support_sessions FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users update own support sessions"
  ON support_sessions FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users insert own support sessions"
  ON support_sessions FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE INDEX idx_support_sessions_user_id ON support_sessions(user_id);
CREATE INDEX idx_support_sessions_conversation_id ON support_sessions(conversation_id);
