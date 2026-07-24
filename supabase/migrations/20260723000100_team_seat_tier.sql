-- Team seat tiers (Standard/Premium) — a Team org's members each hold one
-- of two seat rates; Enterprise seats stay uniform (its variable cost is
-- metered Autonomous Engineering Task usage instead, see
-- autonomous_engineering_task_billing). Nullable: null for every Enterprise
-- member, and for a Team invite until an admin assigns a seat rate.
alter table organization_members
  add column if not exists seat_tier text
  check (seat_tier is null or seat_tier in ('standard', 'premium'));
