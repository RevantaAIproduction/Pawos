-- Organization branding: logo storage metadata

CREATE TABLE IF NOT EXISTS organization_logos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL UNIQUE REFERENCES organizations(id) ON DELETE CASCADE,
  storage_path TEXT NOT NULL,
  file_name TEXT NOT NULL,
  file_size BIGINT NOT NULL,
  mime_type TEXT NOT NULL,
  uploaded_by UUID NOT NULL REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_organization_logos_org ON organization_logos(organization_id);
CREATE INDEX IF NOT EXISTS idx_organization_logos_uploaded_by ON organization_logos(uploaded_by);

-- RLS
ALTER TABLE organization_logos ENABLE ROW LEVEL SECURITY;

-- Members can view organization logo
CREATE POLICY "members_view_logo" ON organization_logos
  FOR SELECT
  USING (
    organization_id IN (
      SELECT organization_id FROM organization_members
      WHERE user_id = auth.uid() AND status = 'active'
    )
  );

-- Only admins can upload/update/delete
CREATE POLICY "admins_manage_logo" ON organization_logos
  FOR ALL
  USING (
    organization_id IN (
      SELECT organization_id FROM organization_members
      WHERE user_id = auth.uid() AND status = 'active' AND role = 'admin'
    )
  );

-- Trigger to update timestamp
CREATE OR REPLACE FUNCTION update_organization_logos_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_organization_logos_updated_at
BEFORE UPDATE ON organization_logos
FOR EACH ROW
EXECUTE FUNCTION update_organization_logos_timestamp();
