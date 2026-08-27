-- Add seat_count column to organizations table to track Team/Enterprise seat purchases.
-- This column was referenced in TypeScript types but missing from the database schema.

alter table organizations
  add column if not exists seat_count integer,
  add constraint organizations_seat_count_check
    check (seat_count is null or seat_count >= 1);

create index if not exists idx_organizations_seat_count on organizations(seat_count);

-- Allow updates via incrementSeatCount RPC
-- (already allowed by existing policies since this is ownership/billing operation)
