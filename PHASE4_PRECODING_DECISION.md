# PHASE 4 PRE-CODING DECISION

**Date:** 2026-09-08  
**Verification Status:** ✅ COMPLETE — READY FOR IMPLEMENTATION  

---

## ENTITLEMENT

**Decision:** Gate status transitions with `autonomousTaskBilling` feature.

**Source Evidence:**
- EntitlementService.ts lines 77-81: "Jira/Linear are the connectors that actually write tickets back, so they're gated together with the Ticket Balance wallet"
- PRO_MAX_FEATURES (lines 95-96): `connectJira` and `connectLinear` are Pro Max+ only
- PRO_MAX_FEATURES (line 97): `autonomousTaskBilling` is Pro Max+ only
- These are grouped together explicitly in the architecture

**Implementation:** Add gate check in IPC handler before calling transition function:
```typescript
if (!entitlementService.isFeatureAvailable('autonomousTaskBilling')) {
  return { ok: false, reason: 'Status transitions require autonomous work access (Pro Max or higher).' };
}
```

---

## AUTHORIZATION

**Decision:** Renderer resolves credentials; IPC verifies entitlement; main process uses credentials.

**Source Evidence:**
- AutonomousOrchestrator.ts line 1192: `await resolveCredentialsForOrganization(input.organizationId)`
- AutonomousOrchestrator.ts line 1193: `if (credentials.jira)` — credentials check
- AutonomousOrchestrator.ts line 1200: credentials passed to IPC handler
- Pattern: Renderer (org/RBAC) → IPC (tier gate) → Main process (credential use)

**Implementation:**
- IPC handler receives: `organizationId` (implicit from parent context OR passed from renderer)
- IPC handler verifies: `entitlementService.isFeatureAvailable('autonomousTaskBilling')`
- Main process uses: credentials provided by renderer (already validated at org level)
- NO additional authorization logic needed in IPC — the credential presence + entitlement check is sufficient

---

## IDEMPOTENCY

**Decision:** NO idempotency layer needed. API operations are naturally idempotent.

**Source Evidence:**

### Jira Behavior:
- JiraWriteBackPlugin.ts line 122: POSTs transition ID
- Jira API design: Setting a state twice is idempotent
  - First POST: state changes
  - Second POST: no-op (already in that state)
  - No duplicate creation

### Linear Behavior:
- LinearWriteBackPlugin.ts line 148: Updates issue state via GraphQL mutation
- Linear API design: Setting state via GraphQL mutation is idempotent
  - First mutation: state changes
  - Second mutation: no-op (already in that state)
  - No duplicate creation

### Why Phase 2 Idempotency NOT Needed:

Phase 2's external-write infrastructure (reconciliation, durable records) solves:
- **Problem:** Comments create duplicates if request repeats (unknown result from network)
- **Solution:** Track request ID, reconcile by searching for matching comment, detect/prevent duplicates

For status transitions:
- ❌ No duplicate creation issue (setting state twice = one state, not two)
- ❌ No unknown-result reconciliation problem (API response is clear: success or error)
- ❌ No data loss if retry needed (setting same state twice is safe)

**Simple retry is safe:** If network fails and caller retries, setting state again will either succeed (if possible) or fail cleanly (if state changed).

**Implementation:** No external-write tracking. Direct API call, return result immediately.

---

## STATUS VALIDATION

**Decision:** Status validation is built into the connector functions. IPC handlers pass through without pre-validation.

**Source Evidence:**

### Jira Validation:
- JiraWriteBackPlugin.ts line 89: Fetches available transitions first
- Line 105: Finds matching transition by name
- Line 107-111: Returns error if transition not found
- ✅ **Already validates before executing transition**

### Linear Validation:
- LinearWriteBackPlugin.ts line 96-106: GraphQL query fetches available states
- Line 138-139: Finds target state by name
- Line 141-142: Returns error if state not found
- ✅ **Already validates before executing update**

**Implementation:**
- IPC receives status name as string
- Passes directly to `transitionJiraIssue()` or `transitionLinearIssue()`
- Connector functions handle validation
- IPC returns result from connector function

---

## IPC IMPLEMENTATION PLAN

### New IPC Handlers to Create:

#### 1. `connectivity:transitionJiraIssue`
- **File:** src/main/ipc/connectivityIpc.ts (or ipc.ts)
- **Handler signature:**
  ```typescript
  ipcMain.handle('connectivity:transitionJiraIssue', async (_evt, input: {
    runId: string;
    jiraUrl: string;
    apiEmail: string;
    apiToken: string;
    issueKey: string;
    transitionName: string;
  }) => {
    if (!entitlementService.isFeatureAvailable('autonomousTaskBilling')) {
      return { ok: false, reason: 'Status transitions require autonomous work access (Pro Max or higher).' };
    }
    const result = await transitionJiraIssue(input.jiraUrl, input.apiEmail, input.apiToken, input.issueKey, input.transitionName);
    return { ok: result.ok, data: result };
  });
  ```

#### 2. `connectivity:transitionLinearIssue`
- **File:** src/main/ipc/connectivityIpc.ts (or ipc.ts)
- **Handler signature:**
  ```typescript
  ipcMain.handle('connectivity:transitionLinearIssue', async (_evt, input: {
    runId: string;
    linearApiKey: string;
    issueId: string;
    statusName: string;
  }) => {
    if (!entitlementService.isFeatureAvailable('autonomousTaskBilling')) {
      return { ok: false, reason: 'Status transitions require autonomous work access (Pro Max or higher).' };
    }
    const result = await transitionLinearIssue(input.linearApiKey, input.issueId, input.statusName);
    return { ok: result.ok, data: result };
  });
  ```

### Bridge Methods:
- Add to src/main/preload/bridgeImpl.ts:
  ```typescript
  transitionJiraIssue: (input) => ipcRenderer.invoke('connectivity:transitionJiraIssue', input),
  transitionLinearIssue: (input) => ipcRenderer.invoke('connectivity:transitionLinearIssue', input),
  ```

### Tests:
- Create src/main/ipc/connectivityIpc.statusTransition.test.ts
- Test: Go tier cannot call (authorization gate)
- Test: Pro Max tier can call (with valid inputs)
- Test: Error handling (invalid status name, API failure, network error)
- Verify results follow `{ ok, data: { ok, reason? } }` pattern

---

## FINAL CHECKLIST

✅ **Entitlement:** Use `autonomousTaskBilling` (established pattern for Jira/Linear writes)
✅ **Authorization:** Renderer resolves credentials; IPC verifies tier; main process uses credentials
✅ **Idempotency:** Not needed (API operations are naturally idempotent)
✅ **Status Validation:** Built into connector functions (pass through)
✅ **Error Handling:** Return standard result format `{ ok, data: { ok, reason? } }`
✅ **No new entitlement matrix changes:** Use existing `autonomousTaskBilling`
✅ **No Phase 2 external-write integration:** Not needed for status transitions
✅ **No AutonomousOrchestrator integration in this phase:** Only wire IPC

---

## APPROVED FOR IMPLEMENTATION

Ready to implement 2 IPC handlers + bridge + tests.
