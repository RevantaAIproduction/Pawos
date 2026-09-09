-- Phase 7: Meeting Persistent Storage
--
-- Replaces in-memory Map storage with Supabase-backed persistence.
-- Enables meeting history, drafts, and scheduled sends across app restarts.
--
-- Key tables:
-- 1. meetings — Core meeting metadata and recording/summary
-- 2. meeting_drafts — Draft emails for meetings
-- 3. meeting_scheduled_sends — Scheduled email sends
--
-- Ownership model: user_id (direct) or organization_id (shared)
-- RLS: Users can access their own meetings + organization meetings

-- =========================================================================
-- 1. Create meetings table
-- =========================================================================
CREATE TABLE IF NOT EXISTS meetings (
  id TEXT PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE,

  -- Core metadata
  title TEXT NOT NULL,
  description TEXT,
  status TEXT NOT NULL DEFAULT 'scheduled' CHECK (status IN ('scheduled', 'in-progress', 'completed', 'cancelled')),

  -- Timing
  started_at TIMESTAMPTZ,
  ended_at TIMESTAMPTZ,
  duration_seconds INTEGER,

  -- Attendees and organizer
  attendees JSONB NOT NULL DEFAULT '[]'::jsonb,
  organizer JSONB NOT NULL,

  -- Recording
  recording JSONB,

  -- Summary (can be null, stored as JSONB)
  summary JSONB,

  -- Calendar integration
  calendar_event_id TEXT,
  meeting_link TEXT,

  -- Timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- Ensure user or org ownership
  CONSTRAINT meeting_ownership CHECK (user_id IS NOT NULL OR organization_id IS NOT NULL)
);

-- =========================================================================
-- 2. Create indexes on meetings
-- =========================================================================
CREATE INDEX IF NOT EXISTS idx_meetings_user_id
  ON meetings(user_id);

CREATE INDEX IF NOT EXISTS idx_meetings_organization_id
  ON meetings(organization_id);

CREATE INDEX IF NOT EXISTS idx_meetings_status
  ON meetings(user_id, status);

CREATE INDEX IF NOT EXISTS idx_meetings_created_at
  ON meetings(user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_meetings_has_summary
  ON meetings(user_id)
  WHERE summary IS NOT NULL;

-- =========================================================================
-- 3. Create meeting_drafts table
-- =========================================================================
CREATE TABLE IF NOT EXISTS meeting_drafts (
  id TEXT PRIMARY KEY,
  meeting_id TEXT NOT NULL REFERENCES meetings(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  -- Recipients and content selection
  recipients TEXT[] NOT NULL DEFAULT '{}',
  content_type TEXT NOT NULL DEFAULT 'entire' CHECK (content_type IN ('entire', 'cropped')),
  selected_content JSONB, -- {topics: [], actionItems: []}

  -- Email draft
  email_draft JSONB NOT NULL, -- {subject, body, previewText}

  -- Timestamps
  saved_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- =========================================================================
-- 4. Create indexes on meeting_drafts
-- =========================================================================
CREATE INDEX IF NOT EXISTS idx_meeting_drafts_meeting_id
  ON meeting_drafts(meeting_id);

CREATE INDEX IF NOT EXISTS idx_meeting_drafts_user_id
  ON meeting_drafts(user_id);

CREATE INDEX IF NOT EXISTS idx_meeting_drafts_created_at
  ON meeting_drafts(user_id, saved_at DESC);

-- =========================================================================
-- 5. Create meeting_scheduled_sends table
-- =========================================================================
CREATE TABLE IF NOT EXISTS meeting_scheduled_sends (
  id TEXT PRIMARY KEY,
  meeting_id TEXT NOT NULL REFERENCES meetings(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  -- Recipients and content
  recipients TEXT[] NOT NULL DEFAULT '{}',
  content_type TEXT NOT NULL DEFAULT 'entire' CHECK (content_type IN ('entire', 'cropped')),
  selected_content JSONB, -- {topics: [], actionItems: []}

  -- Email content
  email_content JSONB NOT NULL, -- {subject, body}

  -- Scheduling
  scheduled_time TIMESTAMPTZ NOT NULL,

  -- Status tracking
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'sent', 'failed')),
  error TEXT,

  -- Timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  sent_at TIMESTAMPTZ
);

-- =========================================================================
-- 6. Create indexes on meeting_scheduled_sends
-- =========================================================================
CREATE INDEX IF NOT EXISTS idx_scheduled_sends_meeting_id
  ON meeting_scheduled_sends(meeting_id);

CREATE INDEX IF NOT EXISTS idx_scheduled_sends_user_id
  ON meeting_scheduled_sends(user_id);

CREATE INDEX IF NOT EXISTS idx_scheduled_sends_status
  ON meeting_scheduled_sends(user_id, status);

CREATE INDEX IF NOT EXISTS idx_scheduled_sends_pending
  ON meeting_scheduled_sends(user_id, scheduled_time)
  WHERE status = 'pending';

-- =========================================================================
-- 7. Enable RLS on meetings
-- =========================================================================
ALTER TABLE meetings ENABLE ROW LEVEL SECURITY;

-- Users can read meetings they own or that belong to their organization
CREATE POLICY meetings_select_own_or_org ON meetings
  FOR SELECT USING (
    user_id = auth.uid()
    OR (organization_id IS NOT NULL AND is_org_member(organization_id, auth.uid()))
  );

-- Users can insert meetings they own
CREATE POLICY meetings_insert_own ON meetings
  FOR INSERT WITH CHECK (
    user_id = auth.uid()
  );

-- Users can update meetings they own or that belong to their organization
CREATE POLICY meetings_update_own_or_org ON meetings
  FOR UPDATE USING (
    user_id = auth.uid()
    OR (organization_id IS NOT NULL AND is_org_member(organization_id, auth.uid()))
  );

-- Users can delete meetings they own
CREATE POLICY meetings_delete_own ON meetings
  FOR DELETE USING (
    user_id = auth.uid()
  );

-- =========================================================================
-- 8. Enable RLS on meeting_drafts
-- =========================================================================
ALTER TABLE meeting_drafts ENABLE ROW LEVEL SECURITY;

-- Users can read their own drafts
CREATE POLICY drafts_select_own ON meeting_drafts
  FOR SELECT USING (user_id = auth.uid());

-- Users can insert their own drafts
CREATE POLICY drafts_insert_own ON meeting_drafts
  FOR INSERT WITH CHECK (user_id = auth.uid());

-- Users can update their own drafts
CREATE POLICY drafts_update_own ON meeting_drafts
  FOR UPDATE USING (user_id = auth.uid());

-- Users can delete their own drafts
CREATE POLICY drafts_delete_own ON meeting_drafts
  FOR DELETE USING (user_id = auth.uid());

-- =========================================================================
-- 9. Enable RLS on meeting_scheduled_sends
-- =========================================================================
ALTER TABLE meeting_scheduled_sends ENABLE ROW LEVEL SECURITY;

-- Users can read their own scheduled sends
CREATE POLICY scheduled_sends_select_own ON meeting_scheduled_sends
  FOR SELECT USING (user_id = auth.uid());

-- Users can insert their own scheduled sends
CREATE POLICY scheduled_sends_insert_own ON meeting_scheduled_sends
  FOR INSERT WITH CHECK (user_id = auth.uid());

-- Users can update their own scheduled sends
CREATE POLICY scheduled_sends_update_own ON meeting_scheduled_sends
  FOR UPDATE USING (user_id = auth.uid());

-- Users can delete their own scheduled sends
CREATE POLICY scheduled_sends_delete_own ON meeting_scheduled_sends
  FOR DELETE USING (user_id = auth.uid());

-- =========================================================================
-- 10. Create or replace trigger for updated_at
-- =========================================================================
CREATE OR REPLACE FUNCTION update_meetings_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_meetings_updated_at
  BEFORE UPDATE ON meetings
  FOR EACH ROW
  EXECUTE FUNCTION update_meetings_updated_at();

CREATE OR REPLACE FUNCTION update_drafts_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_drafts_updated_at
  BEFORE UPDATE ON meeting_drafts
  FOR EACH ROW
  EXECUTE FUNCTION update_drafts_updated_at();
