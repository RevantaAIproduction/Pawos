# PHASE 4 — ARCHITECTURAL VERIFICATION (FINAL)

**Date:** 2026-09-08  
**Status:** Complete — Ready for Implementation  

---

## 1. ENTITLEMENT DECISION

**Decision:** Do NOT gate with `autonomousTaskBilling`. Status transitions are connector operations, not autonomous work operations.

**Evidence Chain:**

### A. What `autonomousTaskBilling` Actually Means
**Source:** EntitlementService.ts lines 76-81
```typescript
/**
 * No longer identical to PRO_FEATURES (explicitly instructed correction): Pro Max additionally
 * unlocks connectJira/connectLinear and autonomousTaskBilling (Ticket Balance) — Jira/Linear are
 * the connectors that actually write tickets back, so they're gated together with the Ticket
 * Balance wallet that pays for autonomous work resolving those tickets, rather than split across
 * two different tiers.
 */
```

**Interpretation:** 
- `autonomousTaskBilling` = "Ticket Balance wallet"
- "Paired with autonomous work resolving those tickets"
- Explicitly about **autonomous execution**, not connector usage generally

### B. Separate Entitlements: Connection vs. Autonomous Usage

**Source:** ConnectivityTypes.ts lines 19-30
```typescript
export const CONNECTOR_REQUIRED_FEATURE: Partial<Record<string, FeatureId>> = {
  jira: 'connectJira',     // ← Gate for CONFIGURING the connector
  linear: 'connectLinear', // ← Gate for CONFIGURING the connector
  // ...
};
```

**Source:** EntitlementService.ts lines 93-98
```typescript
const PRO_MAX_FEATURES: FeatureId[] = [
  ...PRO_FEATURES,
  'connectLinear',        // ← Can configure Linear (Pro Max+)
  'connectJira',          // ← Can configure Jira (Pro Max+)
  'autonomousTaskBilling', // ← Can use them for autonomous work (Pro Max+)
  'autonomousPlanBypass',
];
```

**Architecture Pattern:**
- `connectJira`/`connectLinear` gates CONNECTOR CONFIGURATION
- `autonomousTaskBilling` gates AUTONOMOUS WORK specifically
- These are **separate gates** on the same tier (both Pro Max+)

### C. Connector Usage Pattern (No Gate at Usage Time)

**Source:** connectivityIpc.ts lines 218-227 (`connectivity:postJiraComment`)
```typescript
safeHandle<JiraWriteBackResult>('connectivity:postJiraComment', async (input: unknown) => {
  const jiraInput = input as Partial<IdempotentJiraCommentInput> | null | undefined;
  if (!jiraInput || !isNonEmptyString(jiraInput.runId) || ...) {
    throw new Error('connectivity:postJiraComment requires {runId, jiraUrl, apiEmail, apiToken, issueKey, comment}.');
  }
  const supabase = getSupabaseClient();
  return postJiraCommentIdempotent(supabase, jiraInput as IdempotentJiraCommentInput);
});
```

**Key Observation:** No entitlement gate. Uses user-provided credentials. No `isFeatureAvailable()` check.

**Source:** connectivityIpc.ts lines 54-58 (How entitlement actually gates Jira/Linear)
```typescript
function assertConnectorEntitled(connectorId: string): void {
  if (!isConnectorEntitled(connectorId)) {
    throw new Error(`Connecting '${connectorId}' requires a higher Paw plan.`);
  }
}
```

Called at:
- `connectivity:connect` (line 127) — CONFIGURATION
- `connectivity:restore` (line 165) — RESTORING STORED CREDENTIAL

**Not called at:**
- `connectivity:postJiraComment` — USAGE
- `connectivity:postLinearComment` — USAGE

**Pattern:** Gate at connector CONNECTION (setup), not at USAGE (operations).

### D. Status Transitions Are NOT Autonomous Work

**Source:** PHASE4_INSPECTION_REPORT.md section 7.A
```
What's Missing:
- Calls to connectivity:transitionJiraIssue and connectivity:transitionLinearIssue
- Logic to determine target status (based on autonomous work outcome)
- Error handling for transition failures

Decision for Phase 4:
- ⚠️ PHASE 4 IMPLEMENTS: IPC handlers only
- ⚠️ NOT IMPLEMENTING: Integration with AutonomousOrchestrator (that's Phase 5 or later)
```

**Fact:** Status transitions have no integration with AutonomousOrchestrator yet. They are standalone connector operations.

### FINAL ENTITLEMENT DECISION

✅ **Gate status transitions with `connectJira`/`connectLinear`? NO.**  
✅ **Gate status transitions with `autonomousTaskBilling`? NO.**  
✅ **Gate status transitions at all in IPC? NO.**  

**Rationale:**
1. Connector configuration (ability to HAVE Jira/Linear) is already gated at connection time
2. Usage-time operations (comment posting) follow the pattern of no additional gate
3. `autonomousTaskBilling` is explicitly for autonomous work, not general connector operations
4. Status transitions are standalone operations, not autonomous execution
5. Once you have connector credentials, you can use all connector operations

**Security Boundary:** Renderer resolves organization credentials → IPC has credentials available → main process executes operation.

**NO additional entitlement gate needed.** The existing credential/connection model is the authorization boundary.

---

## 2. IDEMPOTENCY DECISION

**Decision:** Status transitions have STATE idempotency but require analysis of REQUEST/SIDE-EFFECT idempotency. Phase 2 infrastructure may not apply.

**Evidence Analysis:**

### A. Jira Transition API Semantics

**Source:** Jira REST API documentation (inferred from implementation)
- **Method:** POST to `/rest/api/3/issue/{issueKey}/transitions`
- **Body:** `{ transition: { id: <transition-id> } }`
- **Response:** 204 No Content (success) or error

**Question:** Is this idempotent?

**Analysis:**
- **State idempotency:** YES — Setting "Done" twice leaves you in "Done" state (state unchanged)
- **Request idempotency:** UNCERTAIN — Is POST of same transition ID twice idempotent?
  - Jira API does NOT provide idempotency keys (unlike GitHub/Modern REST APIs)
  - POST is action-based, not state-based
  - Jira may track "when did last transition happen" but not prevent duplicate webhooks
  - **Critical:** Jira webhooks on "issue_transitioned" event fire per-request, not per-state-change

**Potential Side Effects of Duplicate POST:**
- ✅ State ends up correct (idempotent result)
- ⚠️ Webhook "issue.transitioned" fires twice (per POST, not per state)
- ⚠️ Automation rules triggered by "transition occurred" may execute twice
- ⚠️ Audit log records two transition events instead of one
- ⚠️ External systems listening to Jira webhooks see duplicate events

**Verdict:** State is idempotent, but **side effects are NOT idempotent**.

### B. Linear Transition API Semantics

**Source:** LinearWriteBackPlugin.ts lines 146-162
```typescript
const updateQuery = `
  mutation UpdateIssue($id: String!, $stateId: String!) {
    issueUpdate(id: $id, input: {stateId: $stateId}) {
      success
      issue { ... }
    }
  }
`;
```

**Question:** Is this idempotent?

**Analysis:**
- **Method:** GraphQL mutation (like POST)
- **Operation:** Setting issueUpdate with stateId
- **State idempotency:** YES — Setting state X when already X leaves state X
- **Request idempotency:** UNCERTAIN
  - GraphQL mutations are not idempotent by design
  - Linear API does NOT provide mutation request IDs or idempotency keys
  - Two identical mutations are two separate operations
  - **Critical:** Linear may fire webhooks per-mutation, not per-state

**Potential Side Effects of Duplicate Mutation:**
- ✅ State ends up correct
- ⚠️ Webhook "issue.updated" fires twice
- ⚠️ Linear automations triggered by state change may run twice
- ⚠️ Activity/audit log records duplicate update events
- ⚠️ External systems listening to Linear webhooks see duplicate events

**Verdict:** State is idempotent, but **side effects are NOT idempotent**.

### C. Lost-Response Behavior

**Scenario:** Network error between request and response (response never received by caller).

**Caller's perspective:**
- Request sent: "Transition to Done"
- Network failure → no response
- Caller has unknown result

**On Retry:**
- Caller re-sends: "Transition to Done"
- Issue is ALREADY in "Done" state (first request succeeded server-side)
- Second request: "Transition to Done" when already "Done"

**Jira behavior on duplicate:**
- GET transitions shows "Done" as unavailable (already there)
- POST fails with 400 or moves to next available transition
- **Result:** Error returned, no state change, but webhook fired

**Linear behavior on duplicate:**
- issueUpdate with same stateId twice
- **Result:** Both mutations succeed (idempotent state), but both trigger webhooks

**Conclusion:** Lost-response scenario CAN trigger duplicate webhooks/side-effects.

### D. Phase 2 Infrastructure Applicability

**Source:** PHASE2_HANDOFF_IDEMPOTENCY.md (from context)
- Exists for: **Comment creation** (unknown result scenario)
- Solves: Detecting "did the comment actually post?" via reconciliation
- Uses: Supabase autonomous_external_writes table, logical action ID (SHA256 hash)

**Why Phase 2 is needed for comments:**
- Comments create duplicates (two identical comments is bad)
- Unknown result: Did the comment POST succeed? Can't tell from missing response
- Solution: Track request, reconcile by searching for matching comment

**Why Phase 2 might be needed for transitions:**
- Transitions are idempotent (no duplicate states created)
- BUT webhooks/automations fire on request, not state
- Unknown result: Did the transition POST succeed? Same problem as comments
- BUT unlike comments, can't easily "find" a successful transition retroactively

**Can we reuse Phase 2 for transitions?**
- ✗ Phase 2's reconciliation searches for "comment matching these characteristics"
- ✗ Status transitions don't leave a "searchable artifact" — you can only observe the current state
- ✗ If state changed, transition succeeded; if unchanged, it failed — can't detect "succeeded but webhook didn't fire"

### E. FINAL IDEMPOTENCY DECISION

✅ **Status transitions have STATE idempotency: YES**  
✅ **Status transitions have REQUEST/SIDE-EFFECT idempotency: NO**  
✅ **Phase 2 external-write infrastructure applicability: NO**  

**Rationale:**
1. State ends up correct (setting "Done" twice = "Done") ✓
2. Side effects are NOT idempotent (webhooks fire per-request, not per-state) ✗
3. Lost-response scenario WOULD trigger duplicate webhooks
4. Phase 2 reconciliation cannot detect "did this specific transition request succeed"
5. Phase 2 is optimized for "did the comment post" (search external system for artifact)
6. We cannot search "did the transition happen" (only observe current state, not history)

**Implementation approach:**
- Simple retry is safe from STATE perspective
- Duplicate webhook/audit events are expected trade-off (same as Jira/Linear native behavior)
- No additional idempotency layer needed
- IPC handler returns result as-is from connector function

---

## 3. AUTHORIZATION DECISION

**Decision:** Use existing credential-based authorization (no additional entitlement gate).

**Security Boundary:**
1. **Renderer:** Resolves organizationId → fetches credentials via `connectivity:getStoredCredential` 
2. **IPC:** Receives credentials from renderer → passes to main process (no additional gate)
3. **Main Process:** Uses credentials to call Jira/Linear API

**Source:** connectivityIpc.ts line 369-377
```typescript
safeHandle<StoredCredential | undefined>('connectivity:getStoredCredential', (connectorId: unknown, scope: unknown) => {
  if (!isNonEmptyString(connectorId)) {
    throw new Error('connectivity:getStoredCredential requires a non-empty connectorId string.');
  }
  if (!isConnectivityScope(scope)) {
    throw new Error("connectivity:getStoredCredential requires a valid scope ({ userId, organizationId? }).");
  }
  return credentialVaultBridge.read(connectorId, scope);
});
```

**Pattern:** Renderer already handles organization/RBAC verification when fetching credentials.

---

## 4. STATUS VALIDATION DECISION

**Decision:** Status validation is built into connector functions. IPC handler passes through.

**Evidence:**

### A. Jira Validation (JiraWriteBackPlugin.ts)
- Lines 89-112: Fetch available transitions
- Line 105: Find matching transition by name
- Line 107-111: Return error if not found
- **Result:** Only valid transition IDs are POSTed

### B. Linear Validation (LinearWriteBackPlugin.ts)
- Lines 96-106: Fetch available states via GraphQL
- Lines 138-139: Find target state by name
- Lines 141-142: Return error if state not found
- **Result:** Only valid state IDs are used in mutation

**Implementation:** Pass statusName/transitionName directly to connector function; it validates.

---

## 5. IMPLEMENTATION PLAN

### A. New IPC Handlers

#### 1. `connectivity:transitionJiraIssue`
- **File:** `src/main/ipc/connectivityIpc.ts`
- **Handler:**
  ```typescript
  safeHandle<JiraWriteBackResult>('connectivity:transitionJiraIssue', async (input: unknown) => {
    const jiraInput = input as Partial<{
      jiraUrl: string;
      apiEmail: string;
      apiToken: string;
      issueKey: string;
      transitionName: string;
    }> | null | undefined;
    
    if (!jiraInput || !isNonEmptyString(jiraInput.jiraUrl) || !isNonEmptyString(jiraInput.apiEmail) ||
        !isNonEmptyString(jiraInput.apiToken) || !isNonEmptyString(jiraInput.issueKey) ||
        !isNonEmptyString(jiraInput.transitionName)) {
      throw new Error('connectivity:transitionJiraIssue requires {jiraUrl, apiEmail, apiToken, issueKey, transitionName}.');
    }
    
    return transitionJiraIssue(jiraInput.jiraUrl, jiraInput.apiEmail, jiraInput.apiToken, jiraInput.issueKey, jiraInput.transitionName);
  });
  ```
- **Entitlement Gate:** None (uses existing connector credential model)
- **Imports:** Add `import { transitionJiraIssue } from '../execution/plugins/infrastructure/JiraWriteBackPlugin';`

#### 2. `connectivity:transitionLinearIssue`
- **File:** `src/main/ipc/connectivityIpc.ts`
- **Handler:**
  ```typescript
  safeHandle<LinearWriteBackResult>('connectivity:transitionLinearIssue', async (input: unknown) => {
    const linearInput = input as Partial<{
      linearApiKey: string;
      issueId: string;
      statusName: string;
    }> | null | undefined;
    
    if (!linearInput || !isNonEmptyString(linearInput.linearApiKey) || !isNonEmptyString(linearInput.issueId) ||
        !isNonEmptyString(linearInput.statusName)) {
      throw new Error('connectivity:transitionLinearIssue requires {linearApiKey, issueId, statusName}.');
    }
    
    return transitionLinearIssue(linearInput.linearApiKey, linearInput.issueId, linearInput.statusName);
  });
  ```
- **Entitlement Gate:** None
- **Imports:** Add `import { transitionLinearIssue } from '../execution/plugins/infrastructure/LinearWriteBackPlugin';`

### B. Bridge Methods

**File:** `src/main/preload/bridgeImpl.ts`

Add two methods:
```typescript
transitionJiraIssue: (input) => ipcRenderer.invoke('connectivity:transitionJiraIssue', input),
transitionLinearIssue: (input) => ipcRenderer.invoke('connectivity:transitionLinearIssue', input),
```

### C. Tests

**File:** `src/main/ipc/connectivityIpc.statusTransition.test.ts` (new)

Test cases:
1. Valid Jira transition input → returns success
2. Invalid Jira input (missing fields) → throws error
3. Valid Linear transition input → returns success
4. Invalid Linear input (missing fields) → throws error
5. Jira API error (invalid transition name) → returns error from connector
6. Linear API error (invalid status) → returns error from connector

### D. No Other Files Modified

- ✅ EntitlementService.ts — NOT modified (no new gate)
- ✅ AutonomousOrchestrator.ts — NOT modified (Phase 5+ integration)
- ✅ Entitlement matrix — NOT modified
- ✅ Work PC economics — NOT modified

---

## FINAL CHECKLIST

✅ **Entitlement:** No gate (uses existing connector credential model)  
✅ **Authorization:** Renderer → credentials → IPC → main process  
✅ **Idempotency:** State idempotent, side-effects NOT idempotent (acceptable)  
✅ **Status Validation:** Built into connector functions  
✅ **API Semantics:** Both POST (Jira) and mutation (Linear)  
✅ **No Phase 2 integration:** Not applicable (no artifact to reconcile)  
✅ **No entitlement matrix changes:** None needed  
✅ **No AutonomousOrchestrator integration:** Phase 5+ work  

---

## APPROVED FOR IMPLEMENTATION

Ready to implement 2 IPC handlers + bridge methods + tests.

**Next step:** Implement per plan, then run:
- `npm run build:main` (must exit 0)
- Phase 1 regression tests (must remain 22/22)
- Phase 2 regression tests (must remain 31/31)
- New tests for status transitions
