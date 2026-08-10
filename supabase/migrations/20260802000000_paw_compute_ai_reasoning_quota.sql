-- Paw Compute usage-limit enforcement — folds 'aiReasoning' (the conversation-turn capability,
-- previously configured only via the static, mostly-null EntitlementService.TIER_ENTITLEMENTS
-- table) into the single usage_quota_config source of truth that already governs the other 7
-- tracked capabilities. No schema change is needed — tier/capability are plain text columns, and
-- increment_organization_usage()/get_organization_usage_summary() already operate generically over
-- whatever rows exist for a given tier, so a new capability value is just new seed data.
--
-- Numbers here match src/main/billing/UsageQuotaConfigStore.ts's defaultConfig() exactly — the two
-- are kept in sync by hand per that file's own established convention. All figures are real but
-- provisional ("Business Configuration Required"), same discipline as every other placeholder
-- business number already seeded by 20260730010000_usage_engine.sql.
--
-- Pro Max is intentionally NOT given its own row — EntitlementService.getCreditLimit() resolves it
-- via UsageQuotaConfigStore's existing derivedFrom mechanism against Pro's row (20x), exactly like
-- the other 7 capabilities. Enterprise's row is pooled, enforced by the existing
-- increment_organization_usage() RPC with zero code changes.

insert into usage_quota_config (tier, capability, monthly_limit, pooled, derived_from_tier, derived_multiplier)
values
  ('go', 'aiReasoning', 20, false, null, null),
  ('pro', 'aiReasoning', 2000, false, null, null),
  ('proMax', 'aiReasoning', null, false, 'pro', 20),
  ('team', 'aiReasoning', 1500, false, null, null),
  ('teamPremium', 'aiReasoning', 3000, false, null, null),
  ('enterprise', 'aiReasoning', 50000, true, null, null)
on conflict (tier, capability) do nothing;
