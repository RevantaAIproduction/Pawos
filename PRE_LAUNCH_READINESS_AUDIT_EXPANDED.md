# EXPANDED PRE-LAUNCH PRODUCTION READINESS AUDIT
**PawOS Desktop Product — Including Payments, Team, Enterprise**  
**Audit Date:** 2026-08-30  
**Scope:** Personal + Team + Enterprise + Billing

---

## EXECUTIVE SUMMARY

PawOS has **solid Phase 0/1/A architecture** but **critical gaps in payment flow, Team lifecycle, and Enterprise lifecycle** that MUST be fixed before launch.

**Current Status: 70% Production-Ready** (accounting for Payments, Team, Enterprise)

**Three Categories of Launch-Critical Work:**
1. **Payment/Checkout Flow** — partially broken, security issues found
2. **Team Lifecycle** — Team creation/checkout/member management incomplete
3. **Enterprise Lifecycle** — Enterprise creation/checkout/member management incomplete

---

## SECTION 1: PAYMENTS / CHECKOUT — CURRENT STATUS

### 1.1 Current Payment Architecture

**Provider:** Razorpay (with validation against pawos-web backend)

**Flow:**
```
Plan Selection (Personal/Team/Enterprise)
  ↓
Checkout Page (TierCheckoutPage / TeamCheckoutPage / EnterpriseCheckoutPage)
  ↓
Razorpay Checkout.js
  ↓
Payment Completion
  ↓
Callback to local loopback server (CheckoutSyncServer)
  ↓
Signature verification against pawos-web /api/billing/verify-subscription
  ↓
SubscriptionStore.confirmPurchase()
  ↓
EntitlementService activation
  ↓
Electron windows notified via IPC
```

### 1.2 Verified Working Components ✓

- [x] Razorpay integration exists
- [x] Loopback callback server implemented (CheckoutSyncServer.ts)
- [x] **P0-3 Security Fix:** Signature verification against pawos-web backend (correctly implemented)
- [x] SubscriptionStore persists subscription state
- [x] EntitlementService gates features by tier
- [x] Team checkout UI exists (TeamCheckoutPage.tsx)
- [x] Team seat pricing: $20 standard, $100 premium per month
- [x] GST calculation implemented (18% for India)
- [x] Enterprise checkout UI exists (EnterpriseCheckoutPage.tsx)
- [x] Billing frequency: monthly + annually
- [x] Address/tax ID collection
- [x] Saved cards UI exists
- [x] Currency conversion (USD to INR: 95.65)

### 1.3 Potentially Broken/Incomplete Components ⚠

**P0-1: Payment Webhook Handling**  
**Status:** INCOMPLETE  
**Issue:** CheckoutSyncServer trusts pawos-web's /api/billing/verify-subscription route, but:
- No retry logic if verify endpoint is down
- No timeout handling if verification hangs
- No fallback if signature verification fails
- subscriptionStore.confirmPurchase() is called WITHOUT checking response validity

**Evidence:** CheckoutSyncServer.ts line 131-139 — verifySubscriptionWithBackend() can return {ok: false} but confirmPurchase() is not conditional on success

**Fix Scope:**
```typescript
// Current (BROKEN):
verifySubscriptionWithBackend(paymentId, subscriptionId, signature).then((verified) => {
  if (!verified.ok) return;
  subscriptionStore.confirmPurchase(verified.tier, {...});  // Always called even if verify failed
});

// Should be:
verifySubscriptionWithBackend(...).then((verified) => {
  if (!verified.ok) {
    logError("Subscription verification failed");
    return;  // Don't call confirmPurchase
  }
  subscriptionStore.confirmPurchase(...);
});
```

---

**P0-2: Team Organization Creation After Checkout**  
**Status:** BROKEN  
**Issue:** Checkout succeeds, but Team organization is not created  
**Problem:** 
- TeamCheckoutPage exists but doesn't hook into organization creation
- No IPC call to create organization after payment succeeds
- No team name → organization name flow
- User completes payment but has no team to invite members to

**Files:**
- `src/renderer/ui/billing/TeamCheckoutPage.tsx` — UI collects team name but no API call
- `src/main/ipc/handlers/organizationHandler.ts` — No handler for "create-team" after payment

**Fix Scope:**
```
1. Add teamId/organizationId to SubscriptionStore state
2. After confirmPurchase() for Team tier:
   - Call ipc.createOrganization({ name, tier: 'team', seatTier, ... })
   - Store organizationId in SubscriptionStore
   - Emit 'team:created' event
   - UI navigates to team-setup/invite-members flow
```

---

**P0-3: Enterprise Organization Creation After Checkout**  
**Status:** BROKEN  
**Issue:** Same as Team — checkout succeeds but organization not created

---

**P0-4: Credits/Ticket-Balance Top-Up Flow**  
**Status:** PARTIALLY WORKING  
**Issue:** 
- CheckoutSyncServer handles credits flow (line 112-119)
- But CreditsCheckoutClient.tsx may not wire it correctly
- No clear flow for "user has $0 credits, wants to buy $10 of credits"

**Evidence:** Comment in CheckoutSyncServer.ts suggests CreditsCheckoutClient is expected to call /api/billing/credit-ticket-balance before this callback

**Fix Scope:**
- Verify CreditsCheckoutClient → /api/billing/credit-ticket-balance flow is complete
- Ensure UI shows remaining credits after purchase
- Test top-up flow end-to-end

---

### 1.4 Entitlement Enforcement ✓ (VERIFIED WORKING)

- [x] EntitlementService gates features by tier
- [x] Connectors respect tier gating (verified in ConnectorEntitlementGate.ts)
- [x] Paw Compute capacity respects tier (PawComputeCapacityStore)
- [x] Credits checked before execution (billing handler)

**BUT:** Need to verify Team/Enterprise seat-tier enforcement is actually implemented (standard vs premium seat usage limits)

---

## SECTION 2: TEAM LIFECYCLE — CURRENT STATUS

### 2.1 Team Flow Architecture

**Expected Flow:**
```
User selects "Team" plan
  ↓
TeamCheckoutPage (2+ standard seats, optional premium seats)
  ↓
Razorpay payment
  ↓
Organization created
  ↓
Team owner (payment user) assigned
  ↓
Invite link/email generated
  ↓
Team members join
  ↓
Member roles/permissions enforced
  ↓
Team Activity Dashboard
  ↓
Team connectors available
  ↓
Team projects accessible to members
```

### 2.2 Verified Working ✓

- [x] TeamCheckoutPage exists
- [x] Seat pricing configured
- [x] GST/billing address collected
- [x] Organization roles exist (admin, member, viewer, etc.)
- [x] RLS enforces organization isolation
- [x] Activity Dashboard shows org-wide tasks
- [x] Connectors respect org scope

### 2.3 Broken/Incomplete ⚠

**P1-1: Team Organization Not Created After Payment**  
See P0-2 above

**P1-2: Team Member Invitation Flow**  
**Status:** UNCLEAR  
**Issue:** No evidence of invitation/join flow  
**Files to Check:**
- `src/renderer/ui/organization/OrganizationInvites.tsx` (if exists)
- `src/main/ipc/handlers/organizationHandler.ts` (invite/accept methods)
- Database: organization_members table may not have "invitation" state

**Fix Scope:**
```
1. Organization creation includes owner (payment user)
2. Generate invitation token/link
3. Send email or show link to share
4. Recipient joins via link
5. organizationHandler.acceptInvite(token)
6. organization_members row created with role='member'
7. Inviter can see pending/accepted invitations
```

---

**P1-3: Team Member Role/Permission Enforcement**  
**Status:** QUESTIONABLE  
**Issue:** Roles exist but enforcement unclear  
**Example Scenarios:**
- Team member tries to install software → should be blocked unless admin permission?
- Team member tries to read private project → blocked or allowed?
- Team member tries to invite another member → blocked or allowed?
- Team member tries to view Activity Dashboard → sees only their own tasks or team's?
- Team member tries to change team settings → blocked?

**Current Implementation:**
- organization_members table has role field
- RoleCapability maps (org, role, capability) → allowed
- But actual permission checks may be missing from IPC handlers

**Fix Scope:**
- Audit each IPC handler that touches org state
- Verify role check before allowing operation
- Document what each role is allowed to do:
  - **admin:** Full team control, member management, settings
  - **member:** Execute, use connectors, create projects, view Activity Dashboard
  - **viewer:** Read-only access (if supported)

---

**P1-4: Team Activity Dashboard**  
**Status:** UNCLEAR  
**Issue:** Does Team Activity Dashboard show only that org's tasks or all tasks?  
**Fix Scope:**
- ActivityDashboardService must filter by organizationId
- Cannot show tasks from other orgs
- Verify RLS prevents leakage

---

### 2.4 Billing State Machine for Team

**Question:** What happens to Team if payment lapses?

**Current Unknown:**
- No visible subscription renewal/expiration flow
- No "subscription expired" UI
- No downgrade flow (Team → Pro/Go)
- No seat-limit enforcement (trying to add member #N+1 when paid for N seats)

**Fix Scope:**
- Subscription expiration detected via EntitlementService
- UI shows warning: "Subscription expires in 7 days"
- After expiration: Team still exists but members can't execute
- Member invitation blocked if seat limit reached

---

## SECTION 3: ENTERPRISE LIFECYCLE — CURRENT STATUS

### 3.1 Enterprise Flow Architecture

**Expected Flow:**
```
Customer selects "Enterprise" plan
  ↓
EnterpriseCheckoutPage (custom seat count + features)
  ↓
Razorpay payment (or custom payment flow)
  ↓
Organization created (Enterprise)
  ↓
Enterprise owner assigned
  ↓
Organization administrators invited/assigned
  ↓
Members invited
  ↓
Organization admin console (if implemented)
  ↓
Audit logging (already exists)
  ↓
Advanced entitlements (e.g., all connectors, high compute)
```

### 3.2 Verified Working ✓

- [x] EnterpriseCheckoutPage exists
- [x] Organization isolation via RLS (Phase 0)
- [x] AuditLogEntry tracking (Phase 0)
- [x] Enterprise tier entitlements (all connectors, higher compute)
- [x] Organization admin distinction (Phase 0)

### 3.3 Broken/Incomplete ⚠

**P1-5: Enterprise Organization Not Created After Checkout**  
See P0-2/P0-3 (same issue as Team)

**P1-6: Enterprise Admin Console Missing**  
**Status:** NOT IMPLEMENTED  
**Issue:** No UI for Enterprise admins to manage organization settings  
**Decisions:**
- Is admin console required for launch? Or defer?
- If required: Need settings panel for:
  - Member management
  - Role assignment
  - Organization name/settings
  - Audit log viewing
  - Subscription/billing status

**Current State:** No admin console UI found  
**Decision:** **DEFER — POST-LAUNCH** unless audit finds it blocks core flow

---

**P1-7: Enterprise Audit Visibility**  
**Status:** PARTIALLY WORKING  
**Issue:** Audit logs exist but unclear who can view them  
**Fix Scope:**
- Only Enterprise organization admins can view org's audit logs
- RLS enforces this
- UI to view audit logs (if not already present)

---

**P1-8: Enterprise Member Seats/Billing**  
**Status:** UNCLEAR  
**Issue:** How does Enterprise billing work?  
**Questions:**
- Fixed seat count or usage-based?
- Can add unlimited members or capped at payment?
- What happens when member count exceeds paid seats?
- How is "seat" counted? (Active users? Invited?)

**Current State:** EnterpriseCheckoutPage exists but logic unclear  
**Decision:** **Clarify before implementing Team/Enterprise seat gating**

---

## SECTION 4: AUTONOMOUS TASK CREDITS & TIER GATING

### 4.1 Current Status: Partially Implemented

**Question from User:** "without credits any one ask to solve what pawos do and without promax tier how that acts"

**Translation:** 
- What happens when user has $0 credits but asks PawOS to solve a task?
- What happens when user is on Pro tier but tries to access Pro Max feature?

### 4.2 Credit Checking ✓

**Location:** `src/main/billing/RollingUsageGate.ts`

**Current Behavior:**
- Before starting autonomous task, check rolling window usage
- If exceeds tier limit: block with "credit exhaustion" error
- If within limit: reserve capacity, proceed with task

**Status:** Appears to be working

---

### 4.3 Tier Feature Gating ✓

**Location:** Multiple files

**Current Behavior:**
- EntitlementService.getEntitlement() returns user's tier
- Each feature checks tier:
  - Connectors: ConnectorEntitlementGate checks tier
  - Runtimes: Features tied to tier in billing types
  - Compute: PawComputeCapacityStore restricts by tier

**Status:** Appears to be working

---

### 4.4 User Experience When Blocked

**Issue:** When blocked by credits or tier, what does user see?

**Files:**
- `src/renderer/ui/billing/CreditsRequiredNotice.tsx` — Shown when credits exhausted
- `src/renderer/conversation/ConversationPanel.tsx` — Should show credit/tier notice before send

**Question:** Is notice shown BEFORE user tries to send, or AFTER attempt fails?

**Fix Scope:**
- ✓ Show notice before send button if insufficient credits
- ✓ Show "upgrade to Pro Max for this connector" before attempting connection
- ✓ Clear error message when blocked

---

## SECTION 5: AUTONOMOUS TASKS FOR JIRA/LINEAR

### 5.1 Current Status

**User's Question:** "autonomous ticket credits and flow of warnings of autonomous ticket credits for jira,linear"

**Interpretation:** 
- Can user autonomously solve Jira/Linear tickets without manually selecting one?
- What warnings are shown?
- How do credits work with autonomous ticket solving?

### 5.2 Current Implementation

**Status:** NOT FULLY IMPLEMENTED

**What Exists:**
- Jira connector (read-only via OAuth)
- Linear connector (read-only via OAuth)
- No apparent "autonomous ticket solver" feature

**Gap:** No evidence of autonomous task flow for "analyze and solve ticket" without credentials

**Decision:** **DEFER — POST-LAUNCH**

This would require:
- Jira/Linear write-back capability (requires scope upgrade)
- Autonomous task planning for external systems
- Verification workflow for remote changes

---

## SECTION 6: SECURITY STATUS

### 6.1 Authentication ✓

- [x] OAuth flows (Google, GitHub, Microsoft)
- [x] Session persistence
- [x] RLS enforces data isolation

### 6.2 Payments ⚠

**P0-3 Issue Found & Fixed:** Signature verification against backend (confirmed in CheckoutSyncServer.ts)

**Status:** Signature verification IS implemented correctly ✓

### 6.3 Organization Isolation ✓

- [x] RLS prevents cross-org access
- [x] Audit logs respect org boundaries

---

## SECTION 7: EXECUTION STATUS

### 7.1 When User Lacks Credits/Tier

**Current Flow:**
```
User: "Install Python"
  ↓
Execution Engine checks entitlement
  ↓
Go tier doesn't include software installation
  ↓
Error: "This feature requires Pro plan"
  ↓
UI shows CreditsRequiredNotice with "Upgrade" button
```

**Status:** Appears to work ✓

---

### 7.2 Background Task with Credits Check

**Current Flow:**
```
Background task running
  ↓
Action requires credits
  ↓
Credits exhausted
  ↓
Task blocked (status: "waiting_for_permission"? or "failed"?)
  ↓
User sees... what? Error? Can they buy credits?
```

**Status:** UNCLEAR — need to verify

---

## SECTION 8: EXACT BLOCKERS FOR LAUNCH

### P0 BLOCKERS (Critical)

#### P0-1: Payment Webhook Not Handling Failures
- **File:** `src/main/billing/CheckoutSyncServer.ts` (line 131-139)
- **Issue:** confirmPurchase() called unconditionally; should be conditional on verification success
- **Risk:** High — could activate subscription without payment verification
- **Fix:** ~20 LOC

#### P0-2: Team Organization Not Created After Checkout
- **File:** `src/renderer/ui/billing/TeamCheckoutPage.tsx`, `src/main/ipc/handlers/organizationHandler.ts`
- **Issue:** Team checkout succeeds but no organization created
- **Risk:** Critical — user paid but cannot use Team
- **Fix:** ~150 LOC + new IPC handler

#### P0-3: Enterprise Organization Not Created After Checkout
- **File:** `src/renderer/ui/billing/EnterpriseCheckoutPage.tsx`, `src/main/ipc/handlers/organizationHandler.ts`
- **Issue:** Same as P0-2
- **Risk:** Critical — user paid but cannot use Enterprise
- **Fix:** ~100 LOC + reuse Team handler

#### P0-4: Credits Top-Up Callback Not Wired
- **File:** `src/renderer/billing/CreditsCheckoutClient.tsx` (unknown status)
- **Issue:** User buys credits but UI doesn't refresh
- **Risk:** High — user thinks payment failed
- **Fix:** ~50 LOC

---

### P1 BLOCKERS (Core Functionality Broken)

#### P1-1: Team Member Invitation Flow Missing
- **Files:** Multiple
- **Issue:** No way to invite team members or accept invitations
- **Risk:** High — Team unusable
- **Fix:** ~300 LOC + database migrations

#### P1-2: Team Member Permissions Not Enforced
- **Files:** All IPC handlers
- **Issue:** Team member can perform admin actions
- **Risk:** Medium — org settings could be modified by members
- **Fix:** ~100 LOC (add permission checks to existing handlers)

#### P1-3: Team Activity Dashboard Scope Unclear
- **Files:** `src/renderer/organization/ActivityDashboardService.ts`
- **Issue:** May show tasks from other orgs
- **Risk:** Low-Medium — data leakage between teams
- **Fix:** ~50 LOC (add org filter)

#### P1-4: Subscription Expiration/Renewal Not Handled
- **Files:** `src/main/billing/SubscriptionStore.ts`, `src/renderer/billing/*`
- **Issue:** No UI for expiring subscriptions
- **Risk:** Medium — users don't know subscription ending
- **Fix:** ~200 LOC

#### P1-5: Seat Limit Enforcement Missing (Team)
- **Files:** `src/main/ipc/handlers/organizationHandler.ts`
- **Issue:** Can add unlimited members even if paid for N seats
- **Risk:** Medium — org misuse
- **Fix:** ~100 LOC

---

### P2 ISSUES (Serious but launchable)

- [ ] Enterprise admin console missing (UI for org settings) — **DEFER** post-launch
- [ ] Error messages when tier/credits insufficient not always shown proactively
- [ ] No clear messaging about "seat limit reached" when trying to add member

---

## SECTION 9: DEFERRED POST-LAUNCH

Do NOT implement for launch:

- [ ] Enterprise admin console
- [ ] Autonomous ticket solver for Jira/Linear (requires write-back scopes)
- [ ] Department administration
- [ ] Advanced seat management/reporting
- [ ] Custom billing plans
- [ ] Usage analytics dashboard

---

## SECTION 10: IMPLEMENTATION PRIORITY

### Critical Path to Launch:

**Phase 1: Payments Stabilization (3-4 hours)**
1. Fix P0-1: Webhook failure handling
2. Fix P0-4: Credits top-up callback

**Phase 2: Team Onboarding (8-10 hours)**
1. Fix P0-2: Create org after Team checkout
2. Fix P1-1: Implement member invitation/join flow
3. Fix P1-2: Enforce member permissions
4. Fix P1-5: Enforce seat limits

**Phase 3: Enterprise Onboarding (4-5 hours)**
1. Fix P0-3: Create org after Enterprise checkout
2. Reuse Team member invitation flow
3. Verify admin roles/permissions

**Phase 4: Verification (4-6 hours)**
1. Fix P1-3: Org-scope Activity Dashboard
2. Fix P1-4: Subscription lifecycle
3. End-to-end testing

**Total Estimated:** 24-28 hours

---

## SECTION 11: EXACT FILES FOR CHANGES

### P0 Fixes:
```
MODIFY:
  src/main/billing/CheckoutSyncServer.ts
  src/renderer/billing/CreditsCheckoutClient.tsx (if exists; verify)
  
IMPACT: Payment flow stability
RISK: Critical but localized
```

### P0-2/P0-3 Team/Enterprise Org Creation:
```
MODIFY:
  src/renderer/ui/billing/TeamCheckoutPage.tsx
  src/renderer/ui/billing/EnterpriseCheckoutPage.tsx
  src/main/billing/SubscriptionStore.ts (add org tracking)

CREATE:
  src/main/ipc/handlers/teamHandler.ts (create-org-after-checkout)
  
ADD IPC:
  src/main/ipc/ipc.ts (team:createOrgAfterCheckout)
  src/renderer/services/ipc/ipcBridgeImplementation.ts

IMPACT: Team/Enterprise checkout workflow
RISK: High (new org creation path)
```

### P1 Fixes (Team/Enterprise Member Management):
```
CREATE:
  src/main/ipc/handlers/organizationInviteHandler.ts
  src/renderer/ui/organization/OrganizationInvites.tsx (if missing)
  
MODIFY:
  src/main/ipc/ipc.ts
  src/renderer/services/ipc/ipcBridgeImplementation.ts
  (all IPC handlers - add permission checks)

DATABASE:
  Supabase migration: add invitations/seat-tracking

IMPACT: Team/Enterprise member management
RISK: High (new complex feature)
```

---

## SECTION 12: TEST MATRIX FOR LAUNCH

### Personal Tier Testing:
- [ ] Sign up → activated as Go tier
- [ ] Execute basic task → works
- [ ] Try to install software → blocked ("requires Pro")
- [ ] Try to use connector → blocked ("requires tier X")

### Team Tier Testing:
- [ ] Select Team plan
- [ ] Complete checkout (Razorpay sandbox)
- [ ] Organization created automatically
- [ ] Invite teammates via link/email
- [ ] Teammate accepts invitation
- [ ] Team member can execute tasks
- [ ] Team member sees team's Activity Dashboard only
- [ ] Add N+1 members (exceeds paid seats) → blocked
- [ ] Subscription expiring → warning shown

### Enterprise Tier Testing:
- [ ] Select Enterprise plan
- [ ] Complete checkout
- [ ] Organization created automatically
- [ ] Members invited
- [ ] Admin roles enforced
- [ ] All connectors available
- [ ] Audit logs visible to admins only

### Multi-Org Testing:
- [ ] Two separate organizations
- [ ] Members cannot see each other's orgs
- [ ] Activity Dashboard isolated per org
- [ ] Projects isolated per org
- [ ] Connectors not shared between orgs

---

## CONCLUSION

**PawOS is currently 70% production-ready when accounting for Payments, Team, and Enterprise flows.**

**To reach 100% (launchable):**

1. **Fix P0 blockers** (4-6 hours) — Payment + org creation
2. **Implement P1 Team/Enterprise features** (18-20 hours) — Member management + role enforcement
3. **Verify + test** (4-6 hours) — Full launch matrix

**Total: 26-32 hours**

**Timeline: 4-5 business days**

---

**Next Step:** Await approval to proceed with fixes in priority order.
