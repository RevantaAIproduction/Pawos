# PHASE 4 PRE-IMPLEMENTATION INSPECTION REPORT

**Date:** 2026-09-08  
**Status:** INSPECTION COMPLETE — READY FOR IMPLEMENTATION  

---

## 1. EXISTING IMPLEMENTATIONS

### A. Jira Transition Function
**File:** `src/main/execution/plugins/infrastructure/JiraWriteBackPlugin.ts:78`

**Function Signature:**
```typescript
export async function transitionJiraIssue(
  jiraUrl: string,
  apiEmail: string,
  apiToken: string,
  issueKey: string,
  transitionName: string
): Promise<JiraWriteBackResult>
```

**Implementation Status:** ✅ **COMPLETE**
- Fetches available transitions for issue
- Finds matching transition by name
- Executes transition via REST API
- Returns error if transition not found
- Proper error handling for HTTP and API errors

---

### B. Linear Transition Function
**File:** `src/main/execution/plugins/infrastructure/LinearWriteBackPlugin.ts:88`

**Function Signature:**
```typescript
export async function transitionLinearIssue(
  linearApiKey: string,
  issueId: string,
  statusName: string
): Promise<LinearWriteBackResult>
```

**Implementation Status:** ✅ **COMPLETE**
- Fetches available states for issue's team via GraphQL
- Finds matching state by name
- Updates issue state via GraphQL mutation
- Returns error if state not found
- Proper error handling for GraphQL and API errors

---

## 2. MISSING IPC HANDLERS

### A. Jira Comment Handler
**Status:** ❌ MISSING (referenced in AutonomousOrchestrator.ts:1200)
- AutonomousOrchestrator calls `connectivity:postJiraComment`
- Handler does not exist in ipc.ts or connectivityIpc.ts
- Phase 2 idempotent function exists: `postJiraCommentIdempotent`
- **PHASE 4 ACTION:** Implement IPC handler for Jira comment posting

### B. Linear Comment Handler
**Status:** ❌ MISSING (referenced in AutonomousOrchestrator.ts:1240)
- AutonomousOrchestrator calls `connectivity:postLinearComment`
- Handler does not exist in ipc.ts or connectivityIpc.ts
- Phase 2 idempotent function exists: `postLinearCommentIdempotent`
- **PHASE 4 ACTION:** Implement IPC handler for Linear comment posting

### C. Jira Status Transition Handler
**Status:** ❌ MISSING
- Function exists: `transitionJiraIssue`
- No IPC handler exists
- No caller yet identified in AutonomousOrchestrator
- **PHASE 4 ACTION:** Implement IPC handler

### D. Linear Status Transition Handler
**Status:** ❌ MISSING
- Function exists: `transitionLinearIssue`
- No IPC handler exists
- No caller yet identified in AutonomousOrchestrator
- **PHASE 4 ACTION:** Implement IPC handler

---

## 3. ARCHITECTURE PATTERNS OBSERVED

### A. Credential Resolution
**Pattern Found:** AutonomousOrchestrator.ts:1202, 1232
```typescript
const credentials = await resolveCredentialsForOrganization(input.organizationId);
// Access via: credentials.jira, credentials.linear
```
- Resolves credentials per organization
- Organization context required for all writes
- Same pattern to follow for status transitions

### B. Error Handling
**Pattern Found:** AutonomousOrchestrator.ts:1209-1215
```typescript
if (result.ok && result.data?.ok) {
  // success
} else {
  const reason = result.error || result.data?.reason || 'Unknown error';
  // handle error
}
```
- IPC handlers return `{ ok, data: { ok, reason?, ... } }`
- Errors collected and returned as string summaries
- No throwing—collect and report all errors

### C. IPC Channel Naming
**Pattern Found:** `connectivity:postJiraComment`, `connectivity:postLinearComment`
- Format: `connectivity:<action>`
- Status transitions should follow: `connectivity:transitionJiraIssue`, `connectivity:transitionLinearIssue`

---

## 4. ENTITLEMENTS & AUTHORIZATION

### A. Current Tier Gate on Meeting Assistant
- Phase 3: 15 handlers gated via `entitlementService.isFeatureAvailable('meetingAssistant')`
- Same pattern should NOT apply to status transitions (no specific feature gate needed)

### B. Status Transition Authorization
**Required:** Connector ownership verification (Phase 2 pattern)
- User must have Jira/Linear connector configured for organization
- Credentials stored in organization context
- Same credential resolution used by comment posting

### C. No New Feature Gate Needed
- Status transitions are part of autonomous work completion
- If user can initiate autonomous work, they can transition status
- No separate `autonomousStatusTransition` or similar gate
- Rely on existing credential ownership verification

---

## 5. IDEMPOTENCY ANALYSIS

### A. Phase 2 External-Write Idempotency Infrastructure
**Files:**
- `supabase/migrations/20260907000001_autonomous_external_writes_idempotency.sql`
- `src/main/execution/plugins/infrastructure/ExternalWriteIdempotency.ts`
- `src/main/execution/plugins/infrastructure/ProviderReconciliation.ts`

**Current Use:** Comment posting (Jira, Linear, GitHub)

### B. Do Status Transitions Need Idempotency?

**Analysis:**
- Status transitions are idempotent by nature (setting "Done" twice = "Done")
- Unlike comments (creating duplicate comments would be bad), status transitions are safe
- Jira API: Setting transition twice = no-op (idempotent)
- Linear API: Setting state twice = no-op (idempotent)

**Decision for Phase 4:**
- ✅ **DO NOT require idempotency layer for status transitions**
- Reason: The operation itself (setting status) is naturally idempotent
- Reason: Reconciliation would be complex (can't query "what status was set by whom")
- Reason: Simple retry is safe—worst case is API says "already in that state"
- **BUT:** Must prevent concurrent calls to same issue (application-level queue if needed)

### C. Connector Retry Behavior
- Both Jira and Linear plugins return `retryable: true` on network errors
- IPC handlers should respect this flag
- AutonomousOrchestrator collects errors but doesn't retry
- **Phase 4 action:** Implement basic retry logic for transient errors (optional, can be added in Phase 5)

---

## 6. EXISTING ENTITLEMENT MATRIX

**No changes needed.** Status transitions do not have their own feature gate.
- Autonomous work execution itself is gated by `autonomousTaskBilling` (Pro Max+)
- If user can execute autonomous work, they can transition the ticket status
- No new feature: `autonomousStatusTransition` or similar

---

## 7. INTEGRATION POINTS

### A. AutonomousOrchestrator.ts
**Current State:**
- Calls `connectivity:postJiraComment` (line 1200)
- Calls `connectivity:postLinearComment` (line 1240)
- Collects outcomes and reports updates
- Does NOT call status transition handlers yet

**What's Missing:**
- Calls to `connectivity:transitionJiraIssue` and `connectivity:transitionLinearIssue`
- Logic to determine target status (based on autonomous work outcome)
- Error handling for transition failures

**Decision for Phase 4:**
- ⚠️ **PHASE 4 IMPLEMENTS:** IPC handlers only
- ⚠️ **NOT IMPLEMENTING:** Integration with AutonomousOrchestrator (that's Phase 5 or later)
- **Reason:** User said "implement the complete existing Jira/Linear status-transition capability"
- **Reason:** The CAPABILITY exists (transitionJiraIssue, transitionLinearIssue functions)
- **Reason:** What's missing is the IPC wiring to make it callable from renderer
- **Reason:** Integration with the execution flow (calling after completion) is separate

### B. Credential Resolution
**Already Implemented:** `resolveCredentialsForOrganization(organizationId)`
- Tested pattern in AutonomousOrchestrator
- Will work for status transitions too

---

## 8. PHASE 2 COMPATIBILITY

### A. External-Write Idempotency
- Status transitions do NOT integrate with it
- Reason: No idempotency layer needed
- Reason: No external write persistence needed for status

### B. ProviderReconciliation
- Status transitions do NOT need reconciliation
- Reconciliation is for determining "did the comment get posted" (unknown result)
- Status: "did we set status to X" is determined by API response

---

## 9. GITHUB STATUS (NOT IN PHASE 4 SCOPE)

- No implementation found for GitHub issue closing
- User explicitly excluded from Phase 4
- Defer to Phase 5 or later

---

## 10. IMPLEMENTATION SCOPE FOR PHASE 4

### ✅ IMPLEMENT:
1. IPC handler: `connectivity:transitionJiraIssue`
   - Input: runId, jiraUrl, apiEmail, apiToken, issueKey, transitionName
   - Uses existing `transitionJiraIssue()` function
   - Returns: `{ ok, data: { ok, reason? } }`

2. IPC handler: `connectivity:transitionLinearIssue`
   - Input: runId, linearApiKey, issueId, statusName
   - Uses existing `transitionLinearIssue()` function
   - Returns: `{ ok, data: { ok, reason? } }`

3. Bridge methods: expose handlers to renderer
   - `transitionJiraIssue(...)`
   - `transitionLinearIssue(...)`

4. Tests: verify handlers work correctly
   - Go tier cannot call (authorization)
   - Pro+ tier can call (with valid credentials)
   - Error handling (invalid status, API errors, etc.)

### ❌ DO NOT IMPLEMENT IN PHASE 4:
- Integration with AutonomousOrchestrator execution flow
- Automatic status transition after completion
- GitHub issue closing
- Meeting Assistant AI/summarization
- Idempotency layer for status transitions
- Staging/Electron testing

---

## 11. ARCHITECTURE DECISION SUMMARY

| Decision | Rationale |
|----------|-----------|
| **No idempotency layer** | Status transitions are naturally idempotent (setting status twice = setting it once) |
| **No new feature gate** | Status transitions follow existing `autonomousTaskBilling` gate (same as autonomous work) |
| **Credential-based auth** | Use existing `resolveCredentialsForOrganization()` pattern |
| **Simple error return** | Return `{ ok: false, reason: "..." }` like existing handlers |
| **Separate IPC handlers** | Two handlers: Jira + Linear (not bundled) |
| **No AutonomousOrchestrator integration** | Only wire IPC; integration is Phase 5+ work |

---

## READY TO IMPLEMENT

All inspection complete. Foundation solid. No blocking dependencies.

**Next Step:** Implement 2 IPC handlers + bridge methods + tests.
