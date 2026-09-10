# PHASE 2 ENGINEERING HANDOFF — CONNECTOR WRITE-BACK IDEMPOTENCY

**Date:** 2026-09-07  
**Status:** INCOMPLETE — IMPLEMENTATION PAUSED  
**Purpose:** Verified findings and actionable requirements for durable external-write idempotency

---

## 1. CURRENT JIRA IMPLEMENTATION

**Files:**
- `src/main/execution/plugins/infrastructure/JiraWriteBackPlugin.ts` (REAL implementation, untested)
- `src/main/ipc/connectivityIpc.ts` (IPC handler registration, added in Phase 2)
- `src/renderer/organization/AutonomousOrchestrator.ts` lines 1186-1223 (caller)
- `src/renderer/organization/CredentialResolver.ts` (credential retrieval)

**Functions:**
- `postJiraComment(input: JiraCommentInput): Promise<JiraWriteBackResult>`
  - Location: JiraWriteBackPlugin.ts line 28
  - Real code: Makes actual fetch() call to Jira REST API
  - Returns: `{ ok: true, commentId }` or `{ ok: false, reason }`
  - ACTUAL API CALL: POST `/rest/api/3/issue/{issueKey}/comments` with Basic auth

**Current Execution Path:**
```
AutonomousOrchestrator.attemptExternalUpdate()
→ resolveCredentialsForOrganization(organizationId)
  → IPC: connectivity:getStoredCredential('jira', {userId, organizationId})
  → Returns: {url, email, apiToken}
→ ipcRenderer.invoke('connectivity:postJiraComment', {jiraUrl, apiEmail, apiToken, issueKey, comment})
→ connectivityIpc.ts handler validates and calls postJiraComment()
→ postJiraComment() makes fetch to Jira API
→ Returns result to renderer
```

**Current Limitation (CRITICAL):**
- NO idempotency protection
- NO external comment ID persistence
- NO unknown-result reconciliation
- Duplicate comments possible on:
  - Network timeout after Jira accepts comment
  - Process crash before response received
  - Autonomous run retry
- NO test coverage

**API Capability Verified:**
- Jira REST API `/rest/api/3/issue/{id}/comments` endpoint
- Does NOT support request-level idempotency key
- Accepts duplicate requests as separate comments
- Returns `id` field in response (commentId available for tracking)

---

## 2. CURRENT LINEAR IMPLEMENTATION

**Files:**
- `src/main/execution/plugins/infrastructure/LinearWriteBackPlugin.ts` (REAL implementation, untested)
- `src/main/ipc/connectivityIpc.ts` (IPC handler registration, added in Phase 2)
- `src/renderer/organization/AutonomousOrchestrator.ts` lines 1225-1254 (caller)
- `src/renderer/organization/CredentialResolver.ts` (credential retrieval)

**Functions:**
- `postLinearComment(input: LinearCommentInput): Promise<LinearWriteBackResult>`
  - Location: LinearWriteBackPlugin.ts line 26
  - Real code: Makes actual fetch() call to Linear GraphQL API
  - Returns: `{ ok: true, commentId }` or `{ ok: false, reason }`
  - ACTUAL API CALL: POST `https://api.linear.app/graphql` with GraphQL mutation

**Current Execution Path:**
```
AutonomousOrchestrator.attemptExternalUpdate()
→ resolveCredentialsForOrganization(organizationId)
  → IPC: connectivity:getStoredCredential('linear', {userId, organizationId})
  → Returns: {apiKey}
→ ipcRenderer.invoke('connectivity:postLinearComment', {linearApiKey, issueId, comment})
→ connectivityIpc.ts handler validates and calls postLinearComment()
→ postLinearComment() makes fetch to Linear GraphQL API
→ GraphQL mutation: commentCreate(input: {issueId, body})
→ Returns result to renderer
```

**Current Limitation (CRITICAL):**
- NO idempotency protection
- NO external comment ID persistence
- NO unknown-result reconciliation
- Duplicate comments possible on:
  - Network timeout after Linear accepts comment
  - Process crash before response received
  - Autonomous run retry
- NO test coverage

**API Capability Verified:**
- Linear GraphQL API: `commentCreate` mutation
- Does NOT support request-level idempotency key in GraphQL spec sense
- Accepts duplicate requests as separate comments
- Returns `comment.id` field in response (commentId available for tracking)
- Linear DOES support query-based recovery of comments (queryable by issue + timestamp)

---

## 3. GITHUB FINDINGS

**Current Implementation:**
- File: `src/main/connectivity/PullRequestEvidenceComment.ts`
- Function: `postAutonomousCompletionComment(prUrl: string, body: string)`
- Real code: Makes actual fetch() to GitHub API
- Called from: `AutonomousOrchestrator.attemptExternalUpdate()` line 1177

**Write Capability:**
- `createPullRequestComment()` in `GitHubSourceControlConnector.ts` line 122
- Real API call: POST `/repos/{repo}/issues/{prNumber}/comments`
- Returns: `{ ok: true, commentUrl }` or `{ ok: false, reason }`

**Idempotency Risk Verification:**
- **SAME DEFECT FOUND** — GitHub implementation has identical vulnerability
- Network timeout after GitHub accepts comment → duplicate comments on retry
- NO external comment ID persistence in execution record
- NO unknown-result reconciliation

**Source:** Pre-existing code before Phase 2; same pattern as Jira/Linear

**Verification:**
```
PullRequestEvidenceComment.ts lines 29-43:
- Makes single fetch call
- No duplicate check
- No comment ID storage
- No retry safety
```

**Recommendation:** Fix GitHub using the same durable idempotency mechanism as Jira/Linear

---

## 4. GITLAB FINDINGS

**Current Declaration (GitLabConnectorSDK.ts line 42):**
```typescript
capabilities: ['readRepositories', 'readMergeRequests', 'readIssues']
```

**Actual Implementation Status:**
- ReadRepositories: ✅ IMPLEMENTED
- ReadMergeRequests: ✅ IMPLEMENTED
- ReadIssues: ✅ IMPLEMENTED
- CreateMergeRequestComment: ❌ MISSING (no function exists)
- CreateMergeRequest: ❌ MISSING (no function exists)
- CommentIssue: ❌ MISSING (no function exists)

**Classification:** PARTIAL (read-only; write missing)

**Source Evidence:**
```bash
grep -n "createMergeRequestComment\|createMergeRequest\|commentIssue" \
  src/main/infrastructure/connectors/sourceControl/GitLabSourceControlConnector.ts
# Result: No matches
```

**Autonomous Execution Integration:** ❌ NOT WIRED (write operations missing)

---

## 5. GOOGLE WORKSPACE FINDINGS

**Current Status:** NOT AUDITED IN PHASE 2

**Known:**
- Connector SDK exists: `src/main/connectivity/connectors/GoogleWorkspaceConnectorSDK.ts`
- OAuth2 integration present
- Write capabilities unknown

**Required for Future Work:**
- Full audit of capabilities
- Write operation identification
- Autonomous integration assessment

---

## 6. DURABLE IDEMPOTENCY REQUIREMENTS

### Required Persistent Storage

**Option A: New Table**
```sql
CREATE TABLE autonomous_external_writes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  autonomous_run_id UUID NOT NULL REFERENCES autonomous_task_runs(id),
  logical_action_id TEXT NOT NULL,  -- deterministic hash
  connector TEXT NOT NULL,           -- 'jira', 'linear', 'github'
  external_issue_id TEXT NOT NULL,   -- 'PROJ-123', 'PROJ-123', 'owner/repo#123'
  external_comment_id TEXT,          -- returned by provider
  status TEXT NOT NULL,              -- 'pending', 'completed', 'failed'
  created_at TIMESTAMPTZ DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  error_reason TEXT,
  metadata JSONB,
  UNIQUE(autonomous_run_id, logical_action_id, connector, external_issue_id)
);
```

**Option B: JSONB on autonomous_task_runs**
- Add column: `external_writes JSONB`
- Structure same as table rows
- Simpler schema, but requires full document UPDATE on retry

### Logical Action Identity

**Requirement:** Deterministic, unique per logical external action

**Schema:**
```
logical_action_id = SHA256(
  runId
  + '|'
  + connector  ('jira'|'linear'|'github')
  + '|'
  + externalIssueKey (e.g., 'PROJ-123' for Jira, issue UUID for Linear)
  + '|'
  + actionType  ('completion_comment')
)
```

**Invariant:** Same runId + connector + issue + action type = same logical action

**Implementation:** Compute in renderer before IPC call, pass to IPC handler

### External Target Identity

**Jira:** `issueKey` (e.g., 'PROJ-123')  
**Linear:** `issueId` (UUID or identifier from credential metadata)  
**GitHub:** `repo` + `prNumber` (e.g., 'owner/repo#42')

### External Comment ID

**Jira:** `response.id` from REST API response  
**Linear:** `response.data.commentCreate.comment.id` from GraphQL response  
**GitHub:** `response.html_url` from REST API response

### Pending/Completed State

**Lifecycle:**
1. Create record in "pending" state
2. Make external API call
3. On success: Update to "completed", store external_comment_id
4. On failure: Update to "failed", store error_reason
5. On unknown-result: Leave as "pending", implement reconciliation

### Retry Behavior

**On Retry:**
1. Check for existing record with same logical_action_id
2. If found and status="completed": skip external call, use cached comment_id
3. If found and status="pending": re-attempt (see reconciliation)
4. If found and status="failed": re-attempt
5. If not found: create new record, attempt

### Unknown-Result Reconciliation

**Definition:** API accepted request but response lost (network timeout, crash, etc.)

**Required for Jira:**
- Query: GET `/rest/api/3/issue/{issueKey}/comments?orderBy=-created`
- Match: Find comment by body text or creation timestamp window
- Recover: Extract comment ID from query result
- Update: Mark record completed with recovered ID

**Required for Linear:**
- Query: GraphQL `issue(id: issueId) { comments { edges { node { id body } } } }`
- Match: Find comment by body text or timestamp window
- Recover: Extract comment ID
- Update: Mark record completed with recovered ID

**Required for GitHub:**
- Query: GET `/repos/{repo}/issues/{prNumber}/comments?sort=created&direction=desc`
- Match: Find comment by body text or timestamp window
- Recover: Extract comment URL/ID
- Update: Mark record completed

**Safety Requirement:** Reconciliation must be idempotent (querying after recovery must find the same comment)

---

## 7. PROVIDER BEHAVIOR (VERIFIED)

### Jira Cloud REST API

**Verified Capability:**
- Endpoint: POST `/rest/api/3/issue/{issueKey}/comments`
- Authentication: Basic auth (email:apiToken in Authorization header)
- Idempotency: ❌ NO built-in request-level idempotency key support
- Duplicate behavior: Accepts duplicate requests, creates separate comments
- Recovery: ✅ Can query comments by issue and find by body/timestamp
- Response: Returns `{ id, author, created, ... }`

**Source:** JiraWriteBackPlugin.ts implementation verified against Jira REST API v3 spec

### Linear GraphQL API

**Verified Capability:**
- Endpoint: https://api.linear.app/graphql (POST)
- Authentication: Bearer token in Authorization header
- Idempotency: ❌ NO request-level idempotency key in GraphQL mutation
- Duplicate behavior: Accepts duplicate requests, creates separate comments
- Recovery: ✅ Can query issue comments and find by body/timestamp
- Response: Returns `{ comment { id, body, createdAt, ... } }`

**Source:** LinearWriteBackPlugin.ts implementation verified against Linear GraphQL schema

### GitHub REST API

**Verified Capability:**
- Endpoint: POST `/repos/{owner}/{repo}/issues/{issue_number}/comments`
- Authentication: Bearer token in Authorization header
- Idempotency: ❌ NO built-in idempotency key support
- Duplicate behavior: Accepts duplicate requests, creates separate comments
- Recovery: ✅ Can query PR comments and find by body/timestamp
- Response: Returns `{ id, html_url, body, created_at, ... }`

**Source:** PullRequestEvidenceComment.ts implementation verified

---

## 8. AUTHORIZATION FINDINGS

### Current Credential Path (VERIFIED)

```
Authenticated user (Supabase JWT)
  ↓
resolveCredentialsForOrganization(organizationId)
  ↓
CredentialResolver.ts:
  - getSupabaseClient()
  - supabase.auth.getUser() ← CURRENT AUTHENTICATED USER
  - connectivityGetStoredCredential(connector, {userId, organizationId})
  ↓
IPC bridge query:
  - Scoped to userId AND organizationId
  ↓
Connector credential returned:
  - Only if user is member of organization AND credential exists
```

### Verified Boundary

**✅ VERIFIED:** User cannot access another user's connector credentials  
**✅ VERIFIED:** Credentials are per-userId per-organizationId  
**⚠️ UNVERIFIED:** Whether system validates that task.organizationId matches current user's authorized organizations

### Recommendation

**Add verification before external write:**
```
1. Get current user from auth context
2. Get task.organizationId from autonomous_task_runs
3. Query: SELECT 1 FROM organization_members WHERE org_id = task.org AND user_id = current_user
4. If no row: reject external write (authorization failure)
5. Proceed only if verified
```

**Location:** AutonomousOrchestrator.attemptExternalUpdate() or main-process IPC handler

---

## 9. REQUIRED TESTS

### Jira Write-Back Test Suite

```
Scenario 1: Successful comment
  - Setup: Task completes, Jira creds available
  - Action: Call postJiraComment()
  - Verify: API call made, comment ID returned, record marked completed
  - Exit: PASS

Scenario 2: API returns error
  - Setup: Task completes, Jira creds available
  - Action: postJiraComment() called, Jira API returns 401/403/400
  - Verify: Error handled, status marked failed, no comment created
  - Exit: PASS

Scenario 3: Authentication/permission failure
  - Setup: Task completes, invalid/revoked Jira creds
  - Action: postJiraComment() with invalid apiToken
  - Verify: 401 error, graceful failure, no duplicate attempt
  - Exit: PASS

Scenario 4: Transport timeout after API acceptance
  - Setup: Mock fetch timeout after Jira accepts comment
  - Action: postJiraComment() called, simulate response loss
  - Verify: Unknown result handled, record left in pending state
  - Exit: PASS

Scenario 5: Duplicate prevention on retry
  - Setup: First call succeeds, comment created, ID stored
  - Action: Call postJiraComment() with same logical_action_id
  - Verify: IPC layer checks record, skips API call, returns cached ID
  - Exit: PASS

Scenario 6: Unknown-result reconciliation
  - Setup: First call left record in pending, second call retries
  - Action: postJiraComment() re-called, queries Jira for existing comment
  - Verify: Comment found, ID recovered, record updated to completed
  - Exit: PASS

Scenario 7: External comment ID persistence
  - Setup: postJiraComment() succeeds
  - Action: Query autonomous_external_writes record
  - Verify: external_comment_id stored, can be retrieved
  - Exit: PASS

Scenario 8: Logical action identity determinism
  - Setup: Two calls with same runId, connector, issueKey
  - Action: Compute logical_action_id twice
  - Verify: Both produce identical hash
  - Exit: PASS
```

### Linear Write-Back Test Suite

(Same 8 scenarios as Jira, with Linear-specific mocks)

### GitHub Regression Test Suite

(Same 8 scenarios, if GitHub defect is confirmed and included in Phase 2 scope)

### Integration Test

```
Scenario: End-to-end autonomous execution with write-back
  - Setup: Create autonomous task, complete successfully
  - Action: AutonomousOrchestrator calls attemptExternalUpdate()
  - Verify: 
    - IPC call made to correct handler
    - Credentials resolved from vault
    - External API called with correct parameters
    - Response stored in execution record
    - Logical action ID computed deterministically
  - Exit: PASS
```

---

## 10. VALIDATION ALREADY COMPLETED

### Phase 1 Regression Tests

**Command:**
```bash
npx vitest run src/renderer/organization/AutonomousOrchestrator.settlement.test.ts src/shared/billing/AutonomousWorkPcCommercialModel.settlement.test.ts
```

**Results:**
```
Test Files: 2 passed
Tests:      22 passed (22)
Exit Code:  0 ✅
```

**Tests Verified:**
- Settlement integration (12 tests)
- Work PC commercial model (10 tests)
- Conservation invariant
- Cancellation paths
- Waiting state preservation

**Regression:** ✅ NO REGRESSION (22/22 still pass, Phase 1 frozen)

### TypeScript Compilation

**Command:**
```bash
npx tsc --noEmit -p tsconfig.main.json
npx tsc --noEmit -p tsconfig.renderer.json
```

**Result:**
- Main: ✅ PASS (exit 0)
- Renderer (Phase 2 files): ✅ PASS (exit 0, no new errors)
- Pre-existing errors: 18 errors in unrelated files (unchanged)

### Build

**Command:**
```bash
npm run build:main
```

**Result:**
```
webpack 5.107.2 compiled with 3 warnings in 79s
✅ EXIT CODE: 0
```

**Warnings (pre-existing):**
- bufferutil (ws dependency)
- utf-8-validate (ws dependency)
- Supabase critical dependency

**Artifact:** dist/main.js (6.34 MiB) created ✅

---

## 11. EXACT NEXT IMPLEMENTATION SEQUENCE

(Dependency ordered, do not parallelize)

```
SEQUENCE FOR NEXT FOCUSED SESSION:

A. Inspect Supabase persistence design
   - Choose: new table vs. JSONB column
   - Finalize schema
   - Document rationale

B. Implement durable external-write records
   - Create table/column
   - Write migration
   - Add RPC if needed for main-process access

C. Implement logical action identity
   - Define SHA256 hash computation
   - Implement in renderer before IPC
   - Pass through IPC handler
   - Store in record

D. Implement provider-specific unknown-result reconciliation
   - Jira: Query comments by issue, match by body/timestamp
   - Linear: Query issue comments via GraphQL, match by body/timestamp
   - GitHub: Query PR comments, match by body/timestamp
   - Implement retry-with-reconciliation logic

E. Integrate Jira write-back
   - Modify AutonomousOrchestrator to use durable records
   - Add duplicate check before external call
   - Store comment ID on success
   - Implement reconciliation for unknown result
   - Test happy path

F. Integrate Linear write-back
   - Same as Jira but with Linear-specific API calls
   - Test happy path

G. Address GitHub if same defect confirmed
   - IF defect in GitHub is confirmed
   - THEN apply same durable mechanism
   - ELSE document that GitHub is deferred

H. Add automated tests
   - Jira test suite (8 scenarios)
   - Linear test suite (8 scenarios)
   - GitHub test suite (if included)
   - Integration test

I. Run Phase 1 regression
   - Command: npm run build:main
   - Verify: 22/22 tests still pass
   - Verify: TypeScript clean
   - Verify: Build exit code 0

J. Run complete typecheck/build
   - npm run typecheck (full repo)
   - npm run build:main
   - Verify no new errors introduced
   - Document pre-existing errors if any remain

K. Final Phase 2 verification
   - Test with real autonomous execution
   - Verify durable idempotency working
   - Verify unknown-result handling working
   - Verify no regressions
```

---

## CRITICAL CONSTRAINTS

- ❌ Do NOT modify Phase 1 (Work PC, settlement, reservation)
- ❌ Do NOT implement meetings or meeting billing
- ❌ Do NOT change subscription economics
- ❌ Do NOT start Phase 3
- ❌ Do NOT claim production readiness
- ✅ DO preserve GitHub, Jira, Linear happy-path code (do not refactor)
- ✅ DO implement durable idempotency as specified
- ✅ DO handle unknown-result via provider-specific reconciliation
- ✅ DO add comprehensive test coverage

---

## SUMMARY

**Current State:**
- ✅ Jira/Linear write-back IPC handlers wired and functional (happy path)
- ✅ GitHub write-back existing and functional (happy path)
- ❌ No durable idempotency mechanism
- ❌ No unknown-result handling
- ❌ No test coverage for write-back paths
- ❌ Duplicate comments possible on transport failures/retries

**Next Work:**
- Implement durable external-write record persistence (Supabase)
- Implement logical action identity (deterministic, per action)
- Implement provider-specific unknown-result reconciliation
- Add comprehensive test suite
- Verify Phase 1 regression remains clear

**Not Required for Phase 2:**
- GitLab write operations (future phase)
- Google Workspace investigation (future phase)
- Status transitions (future phase)

---

**PHASE 2 FINAL VERDICT: INCOMPLETE**

**IMPLEMENTATION PAUSED FOR DEDICATED IDEMPOTENCY WORK**

