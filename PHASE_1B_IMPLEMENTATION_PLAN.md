# PHASE 1B — ADMIN CENTER READ-ONLY CORE
## Implementation Plan

**Status:** Planning  
**Phase:** 1B (Read-Only Expansion)  
**Target:** All 9 sections with safe data reuse, no mutations

---

## STRATEGY

### Phase 1A Foundation (Already Complete)
- ✅ Authorization boundary (main process)
- ✅ AdminCenterSection component skeleton
- ✅ IPC handler framework
- ✅ Navigation routing

### Phase 1B Task: Implement 9 Read-Only Sections

Each section must:
1. Call admin-specific IPC handlers
2. Handlers enforce authorization first
3. All data via authenticated Supabase (RLS-gated)
4. No secrets exposed to renderer
5. Read-only display only

---

## IPC HANDLERS TO ADD

**File:** `src/main/ipc/handlers/adminHandler.ts` (extend existing)

### Handler 1: getAdminUsers()
```
Input: userEmail, supabaseClient, search?, tier?, org?, limit?, offset?
Output: { ok, data: { users: [], total, hasMore } }
Queries: users (with tier from subscription_tier), organizations
Auth: checkAdminAccess() first
RLS: Authenticated queries respect RLS
```

### Handler 2: getAdminUserDetail()
```
Input: userEmail, supabaseClient, userId
Output: { ok, data: { user, tier, organizations, wallet, runHistory, auditTrail } }
Queries: users, subscriptions, organization_members, org_task_credits, autonomous_task_runs, audit_log
Auth: checkAdminAccess() first
RLS: Queries scoped by existing RLS
```

### Handler 3: getAdminOrganizations()
```
Input: userEmail, supabaseClient, search?, limit?, offset?
Output: { ok, data: { orgs: [], total, hasMore } }
Queries: organizations (with owner, member count)
Auth: checkAdminAccess() first
RLS: Authenticated queries respect RLS
```

### Handler 4: getAdminOrganizationDetail()
```
Input: userEmail, supabaseClient, orgId
Output: { ok, data: { org, members, wallet, billingEvents, runHistory } }
Queries: organizations, organization_members, org_task_credits, organization_billing_events, autonomous_task_runs
Auth: checkAdminAccess() first
RLS: Queries scoped by existing RLS
```

### Handler 5: getAdminAutonomousRuns()
```
Input: userEmail, supabaseClient, status?, user?, org?, dateFrom?, dateTo?, limit?, offset?
Output: { ok, data: { runs: [], total, hasMore } }
Queries: autonomous_task_runs with joins
Auth: checkAdminAccess() first
RLS: Respects existing RLS on runs
```

### Handler 6: getAdminBillingEvents()
```
Input: userEmail, supabaseClient, org?, type?, dateFrom?, dateTo?, limit?, offset?
Output: { ok, data: { events: [], total, hasMore } }
Queries: organization_billing_events
Auth: checkAdminAccess() first
RLS: Respects existing RLS
```

### Handler 7: getAdminAuditLog()
```
Input: userEmail, supabaseClient, actor?, action?, entityType?, entityId?, dateFrom?, dateTo?, limit?, offset?
Output: { ok, data: { entries: [], total, hasMore } }
Queries: audit_log (and related audit tables)
Auth: checkAdminAccess() first
RLS: Respects existing RLS
```

### Handler 8: getAdminEntitlements()
```
Input: userEmail, supabaseClient, userId?
Output: { ok, data: { realTier, effectiveTier, testOverride, organizations: { orgId: tier[] } } }
Queries: subscriptions, admin_test_tier_overrides
Auth: checkAdminAccess() first
RLS: Respects existing RLS
```

### Handler 9: getAdminWallet()
```
Input: userEmail, supabaseClient, userId?, orgId?
Output: { ok, data: { available, reserved, total, recentHistory, purchases } }
Queries: org_task_credits, user_task_credits, organization_billing_events
Auth: checkAdminAccess() first
RLS: Respects existing RLS
```

---

## UI COMPONENTS TO ADD

**Directory:** `src/renderer/ui/AdminCenter/sections/`

### Component 1: OverviewSection.tsx
- Calls `ipc.adminGetOverview()` on mount
- Displays as 4 metric cards (users, orgs, active runs, recent billing)
- Shows loading/error states
- Uses existing grid layout from Dashboard

### Component 2: UsersSection.tsx
- Search bar for email/ID
- Filter by tier (Go/Pro/Pro Max/Team/Enterprise)
- Paginated table with columns: ID, Email, Tier, Effective Tier, Orgs, Created
- Click row to navigate to user detail
- Loading/empty/error states

### Component 3: UserDetailView.tsx
- Tabs: Overview | Tier & Entitlements | Wallet | Run History | Audit
- **Overview Tab:**
  - ID, Email, Created date, Last login
  - Organizations and roles
- **Tier Tab:**
  - Real subscription tier
  - Effective tier (if test override active)
  - Test override status (if any)
- **Wallet Tab:**
  - Available credits
  - Reserved credits
  - Total balance
  - Recent purchases/settlements
- **Run History Tab:**
  - List of autonomous runs by this user
  - Status, cost, created date
- **Audit Tab:**
  - Audit log entries related to user

### Component 4: OrganizationsSection.tsx
- Search bar for name/ID
- Filter by tier (Team/Enterprise)
- Paginated table with columns: ID, Name, Tier, Owner, Seat Count, Members, Created
- Click row to navigate to org detail
- Loading/empty/error states

### Component 5: OrganizationDetailView.tsx
- Tabs: Overview | Members | Wallet | Billing | Runs | Audit
- Similar structure to UserDetailView but org-scoped

### Component 6: AccessEntitlementsSection.tsx
- Shows real tier vs effective tier (with test override indicator if active)
- Read-only display only (no mutations)
- Integrates with UserDetailView tab

### Component 7: CreditsWalletSection.tsx
- User/org wallet balance display
- Recent purchase history
- Settlement information
- Read-only (no grant/adjust/topup)
- Integrates with UserDetailView/OrgDetailView tabs

### Component 8: AutonomousExecutionSection.tsx
- List autonomous task runs with filters
- Status, user/org context, cost, timestamps
- Click for detail view
- Respects existing run state infrastructure

### Component 9: IntegrationsSection.tsx
- Safe metadata only (provider name, connected/disconnected state)
- NEVER expose tokens/keys/credentials
- Read-only

### Component 10: AuditLogSection.tsx
- Timeline view of audit_log + related events
- Filter by date/actor/action/entity
- Redact sensitive values (tokens, credentials)
- Uses existing audit_log table

---

## DATA REUSE STRATEGY

### DO Reuse
- **EntitlementService** - get tier features, check entitlements (READ-ONLY)
- **CreditPoolService.getPool()** / `.getSummary()` - read wallet balance
- **SubscriptionStore** - read subscription tier data
- **Existing Supabase tables:** users, organizations, org_task_credits, organization_billing_events, autonomous_task_runs, audit_log, admin_test_tier_overrides
- **Existing RLS policies** - all authenticated queries respect them

### DO NOT
- Create new admin-specific tables
- Add service-role credentials
- Weaken RLS policies
- Access encrypted fields
- Bypass existing authorization patterns
- Create mutation handlers
- Add arbitrary query mechanisms

---

## IMPLEMENTATION SEQUENCE

### Phase 1B.1: Infrastructure
1. Update `adminHandler.ts` with all 9 handlers (stub implementations that return empty)
2. Register handlers in `ipc.ts`
3. Update `ipcBridgeImplementation.ts` with all 9 methods
4. Create `adminCenter/sections/` directory structure

### Phase 1B.2: Foundation Components
5. Create base components: UsersSection, OrganizationsSection
6. Implement with mock/empty data first (handler stubs)
7. Implement OverviewSection with real data

### Phase 1B.3: Detail Views
8. Create UserDetailView component
9. Create OrganizationDetailView component
10. Wire navigation from list to detail

### Phase 1B.4: Specialized Sections
11. AccessEntitlementsSection
12. CreditsWalletSection
13. AutonomousExecutionSection

### Phase 1B.5: Supporting Views
14. IntegrationsSection
15. AuditLogSection

### Phase 1B.6: Verification
16. Implement all handlers with real queries (replace stubs)
17. Test all 9 sections with real data
18. Verify authorization, RLS, secrets
19. Run build and tests

---

## FILE CHANGES SUMMARY

### New Files (12+)
```
src/renderer/ui/AdminCenter/sections/
  ├── OverviewSection.tsx
  ├── UsersSection.tsx
  ├── UserDetailView.tsx
  ├── OrganizationsSection.tsx
  ├── OrganizationDetailView.tsx
  ├── AccessEntitlementsSection.tsx
  ├── CreditsWalletSection.tsx
  ├── AutonomousExecutionSection.tsx
  ├── IntegrationsSection.tsx
  ├── AuditLogSection.tsx
  ├── index.ts (exports all sections)
  └── sections.module.css (shared styles)
```

### Modified Files (3)
```
src/main/ipc/handlers/adminHandler.ts (add 9 handlers)
src/main/ipc/ipc.ts (register 9 handlers)
src/renderer/services/ipc/ipcBridgeImplementation.ts (add 9 methods)
src/renderer/ui/AdminCenter/AdminCenterSection.tsx (wire section routing)
```

---

## VERIFICATION CHECKLIST

✅ Authorization
- [ ] All handlers call checkAdminAccess() first
- [ ] Renderer cannot bypass authorization
- [ ] Normal users rejected at main process

✅ Data Isolation
- [ ] No cross-organization data leakage
- [ ] RLS policies respected
- [ ] User cannot see other users' sensitive data

✅ Secrets
- Search all Phase 1B files for:
  - [ ] service-role → 0 matches
  - [ ] SERVICE_ROLE → 0 matches
  - [ ] Razorpay secret → 0 matches
  - [ ] OAuth access token → 0 matches
  - [ ] refresh token → 0 matches
  - [ ] password → 0 matches (only in comments)
  - [ ] Vault plaintext → 0 matches
  - [ ] session token → 0 matches

✅ Mutations
- [ ] No credit grants
- [ ] No balance adjustments
- [ ] No tier changes
- [ ] No organization mutations
- [ ] No run cancellations/retries
- [ ] No approval/rejection functionality

✅ Build
- [ ] npm run build succeeds
- [ ] No TypeScript errors
- [ ] No console errors on startup

✅ Regression
- [ ] Existing test-tier system works
- [ ] Wallet accounting unchanged
- [ ] Entitlements unchanged
- [ ] Billing flows unchanged

---

## KNOWN CONSTRAINTS

1. **User list may be incomplete** if auth.users table is RLS-gated
   - Fallback: show only users in organization_members (known users)
   - Document limitation clearly

2. **Approval system** - Phase 1A audit showed approval infrastructure not yet ready
   - Show placeholder in ApprovalSection
   - Do not implement approval UX

3. **Test tier overrides** - Admin can VIEW but not EDIT
   - Show current override status in user detail
   - No "Apply" or "Clear" buttons in Phase 1B

4. **Cross-user billing** - Organization billing is owner-scoped
   - Admins can see all org billing
   - Respects existing RLS on billing events

---

## ESTIMATED EFFORT

- Infrastructure setup: 1-2 tasks
- Foundation components: 2-3 tasks
- Detail views: 2-3 tasks
- Specialized sections: 3-4 tasks
- Supporting views: 2 tasks
- Verification: 1-2 tasks
- **Total:** ~15 incremental tasks

Each task is independent after infrastructure, allowing parallel work.

---

**Ready to begin Phase 1B.1 (Infrastructure)**
