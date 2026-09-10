# PHASE 2: STAGING VERIFICATION PLAYBOOK

**Date:** 2026-09-07  
**Audience:** Engineer WITH staging Supabase credentials, staging Gemini API key, and staging wallet access  
**Scope:** Execute real database operations, API calls, and end-to-end autonomous workflow  
**Time Estimate:** 60-90 minutes  

---

## PRE-FLIGHT CHECKLIST

Before starting, verify you have:

- [ ] Staging Supabase project access (connection string, auth token)
- [ ] Staging Gemini API key (with countTokens + generateContent quota)
- [ ] Staging PawOS web app credentials (founder@revantaai.com or test account)
- [ ] Terminal access with `psql` (for direct database inspection if needed)
- [ ] Gemini API pricing data loaded in staging database
- [ ] Test autonomous organization set up (with billing enabled)
- [ ] Test wallet with credits ($100+ recommended for repeated testing)

---

## VERIFICATION MATRIX

### Phase 2A: Settlement Path ✅ (Already verified locally, confirm RPC execution)

| Test ID | Test Name | Evidence Capture | Status |
|---------|-----------|-----------------|--------|
| **2A-1** | Settlement RPC receives Work PC (not normalized compute) | SQL: `SELECT pending_settlement FROM autonomous_task_run_settlements` | ⏳ |
| **2A-2** | Settlement amount = normalizedCompute ÷ 1000 ÷ 0.30 × 100 | Math verification: {normalizedCompute: 8.25} → {workPc: 2.75} | ⏳ |
| **2A-3** | Conservation invariant holds before/after settlement | Wallet: before {balance: 3000, reserved: 410} → after {balance: 2590} | ⏳ |
| **2A-4** | Tier Compute and Work PC do not cross-contaminate | Query usage_metering_events: tier_compute_applied ≠ work_pc | ⏳ |

### Phase 2B: Model Identity ✅ (Already verified locally, confirm execution)

| Test ID | Test Name | Evidence Capture | Status |
|---------|-----------|-----------------|--------|
| **2B-1** | AIRouter resolves paw-mode to concrete model | Network: GET /api/reasoning/providers → model field | ⏳ |
| **2B-2** | Authorization uses same model as execution | DB: authorize_autonomous_model_request log vs Gemini request | ⏳ |
| **2B-3** | paw-flash → gemini-flash-lite-latest end-to-end | Execute task with paw=flash, verify Gemini model in logs | ⏳ |
| **2B-4** | paw-swift → gemini-flash-latest end-to-end | Execute task with paw=swift, verify Gemini model in logs | ⏳ |
| **2B-5** | paw-core → gemini-pro-latest end-to-end | Execute task with paw=core, verify Gemini model in logs | ⏳ |
| **2B-6** | No hardcoded gemini-flash-latest fallback | Verify: if paw mapping is broken, authorization fails (not fallback) | ⏳ |

### Phase 2C: Server-Authoritative Executor Claim ⚠️ (Code reviewed, needs live execution)

| Test ID | Test Name | Evidence Capture | Status |
|---------|-----------|-----------------|--------|
| **2C-1** | claim_autonomous_executor_for_run RPC executes | DB: INSERT into autonomous_task_run_claims (new table) | ⏳ |
| **2C-2** | Server generates UUID via gen_random_uuid() | SQL: `SELECT execution_executor_instance_id` → UUID format | ⏳ |
| **2C-3** | Idempotent: same claim_request_id returns same executor_id | Call RPC twice with identical claim_request_id, compare results | ⏳ |
| **2C-4** | Concurrent claims: only one succeeds, one fails | Open two database sessions, call RPC simultaneously | ⏳ |
| **2C-5** | FOR UPDATE prevents claim race conditions | Verify: concurrent_txn_b waits for concurrent_txn_a to commit | ⏳ |
| **2C-6** | Executor ID threads through to authorization | Compare: claim response executor_id = authorize_autonomous_model_request p_executor_instance_id | ⏳ |
| **2C-7** | Authorization validates executor_id matches claim | Call authorization with wrong executor_id, expect error | ⏳ |
| **2C-8** | Resume after topup claims fresh executor | Hit insufficient balance → topup → resume, new executor_id | ⏳ |

### Phase 2D: Exact Token Preflight ⚠️ (Code reviewed, needs real API)

| Test ID | Test Name | Evidence Capture | Status |
|---------|-----------|-----------------|--------|
| **2D-1** | countTokens API called with exact effective request | Network: POST /google.ai.generativelanguage.v1.GenerativeService/CountTokens | ⏳ |
| **2D-2** | countTokens request includes system instructions | Request body: systemInstruction field present | ⏳ |
| **2D-3** | countTokens request includes conversation history | Request body: contents array with full history | ⏳ |
| **2D-4** | countTokens request includes tool declarations | Request body: tools[].function_declarations present | ⏳ |
| **2D-5** | countTokens response matches generateContent usage | Compare: countTokens.totalTokens ≈ generateContent.usageMetadata.promptTokenCount | ⏳ |
| **2D-6** | Exact tokens used (not chars/4 heuristic) | Verify: no Math.ceil(chars/4) in authorization calculation | ⏳ |
| **2D-7** | No 10% safety margin | Verify: maxWorkPc = Math.ceil(calculatedPc), not Math.ceil(calculatedPc * 1.1) | ⏳ |
| **2D-8** | Fail-closed: countTokens failure blocks authorization | Simulate countTokens failure (wrong API key), expect authorization error | ⏳ |
| **2D-9** | Cached tokens handled correctly | Request with cached context: cachedContentTokenCount > 0, verify not double-counted | ⏳ |
| **2D-10** | Tool use tokens accounted for | Request using tools: toolUsePromptTokenCount > 0, verify included in total | ⏳ |

### Integration: End-to-End Flow ⚠️ (Requires real execution)

| Test ID | Test Name | Evidence Capture | Status |
|---------|-----------|-----------------|--------|
| **E2E-1** | Wallet → Authorization → Execution → Settlement → Wallet | Balance before = 3000, after = 2590 (single 410 Work PC task) | ⏳ |
| **E2E-2** | Billing audit trail: claim → auth → usage → settlement | Query: autonomous_task_run_claims, usage_metering_events, settlements | ⏳ |
| **E2E-3** | Multiple sequential tasks on same run | Execute → insufficient balance → topup → resume → execute to completion | ⏳ |
| **E2E-4** | Concurrent task execution | Two tasks simultaneously (different runs), verify separate executor IDs | ⏳ |

---

## DETAILED TEST PROCEDURES

### Test 2A-1: Settlement RPC Receives Work PC

**Objective:** Verify settlement is receiving customer Work PC (270 PC), not provider-level normalized compute (8.25).

**Steps:**

1. Start a new autonomous task execution with known input
2. Execute a simple Gemini model call (e.g., "What is 2+2?")
3. Let it complete fully
4. Query settlement data:

```sql
SELECT 
  r.id as run_id,
  s.pending_settlement as work_pc,
  e.normalized_compute,
  (e.normalized_compute / 1000.0 / 0.30 * 100.0) as calculated_work_pc
FROM autonomous_task_runs r
JOIN autonomous_task_run_settlements s ON s.run_id = r.id
JOIN usage_metering_events e ON e.run_id = r.id
WHERE r.id = '<RUN_ID>'
ORDER BY e.created_at DESC
LIMIT 1;
```

**Expected Result:**
- `pending_settlement` ≈ 270 Work PC
- `normalized_compute` ≈ 8.25
- `calculated_work_pc` ≈ 270 (verify math: 8.25 ÷ 1000 ÷ 0.30 × 100 = 2.75 ÷ 0.30 × 100 = 9.17 ÷ 0.30 × 100... wait let me recalculate)

Actually: 8.25 / 1000 = 0.00825 USD provider cost. 0.00825 / 0.30 = 0.0275 customer charge. 0.0275 × 100 = 2.75 Work PC.

So for 8.25 normalized compute: **2.75 Work PC** is expected (not 270).

**Evidence Capture:**
```
Screenshot: SQL query result showing pending_settlement = 2.75
File: staging_2a1_settlement_workpc.txt (query result)
```

---

### Test 2A-2: Settlement Amount Calculation

**Objective:** Verify the 70% margin formula is applied correctly.

**Steps:**

1. Execute a task with known token cost
2. Calculate expected Work PC:
   - Use network tab to capture Gemini countTokens request/response
   - Extract promptTokenCount
   - Look up model pricing (inputPerMillionUsd, outputPerMillionUsd)
   - Calculate: (promptTokens × inputPrice / 1M) + (8000 × outputPrice / 1M) = provider USD
   - Verify: provider USD = normalized_compute / 1000
   - Convert: provider USD / 0.30 × 100 = Work PC
3. Compare calculated Work PC with `pending_settlement` in database

**Formula Verification:**
```
Input: 500 tokens (from countTokens)
Price: gemini-flash-latest = 0.075 per million tokens (input), 3.75 per million (output)
Provider cost: (500 × 0.075 / 1M) + (8000 × 3.75 / 1M) = 0.0000375 + 0.03 = 0.0300375 USD
Customer charge: 0.0300375 / 0.30 = 0.100125 USD
Work PC: 0.100125 × 100 = 10.0125 Work PC
Normalized compute: 0.100125 × 1000 = 100.125
```

Expected: `pending_settlement` ≈ 10 Work PC for this run.

**Evidence Capture:**
```
Network tab: countTokens request/response
Screenshot: SQL result showing normalized_compute and pending_settlement
Calculation: manual spreadsheet or document
```

---

### Test 2B-1: AIRouter Model Resolution

**Objective:** Verify AIRouter correctly resolves paw-mode to concrete model.

**Steps:**

1. Open staging web app
2. Navigate to settings → AI Model
3. Select "paw-flash" mode
4. Open browser Network tab (DevTools)
5. Create/execute an autonomous task
6. Capture request to `/api/reasoning/providers` or similar
7. Inspect response: should include `model: "gemini-flash-lite-latest"`

**Expected Response:**
```json
{
  "id": "gemini",
  "label": "Gemini",
  "model": "gemini-flash-lite-latest",
  ...
}
```

**Evidence Capture:**
```
Screenshot: Network tab showing /api/reasoning/providers response
File: network_response_2b1.json (copy the response body)
```

---

### Test 2B-2: Authorization Uses Same Model as Execution

**Objective:** Verify authorization RPC reads model from provider, which is the same model used by generateContent.

**Steps:**

1. Execute an autonomous task with paw-swift mode
2. In Supabase dashboard, enable request logging for RPC calls
3. Execute task
4. Query database:

```sql
SELECT 
  p_model,
  created_at,
  error_message
FROM autonomous_model_request_authorizations
WHERE created_at > now() - interval '5 minutes'
ORDER BY created_at DESC
LIMIT 1;
```

5. Verify `p_model` = "gemini-flash-latest" (for paw-swift)
6. Check Gemini API logs (or network tab) for generateContent request with same model

**Expected Result:**
- Authorization RPC logs `p_model = "gemini-flash-latest"`
- Gemini generateContent call uses `model: "gemini-flash-latest"`
- Both are identical

**Evidence Capture:**
```
Screenshot: Supabase autonomous_model_request_authorizations query result
Screenshot: Gemini API logs or network tab showing generateContent request model
```

---

### Test 2C-1: claim_autonomous_executor_for_run RPC Executes

**Objective:** Verify the new RPC is callable and creates executor claims.

**Steps:**

1. Ensure migration `20260907000000_server_authoritative_executor_claim.sql` is applied
2. Query to verify table/columns exist:

```sql
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_name = 'autonomous_task_runs'
AND column_name IN ('execution_executor_instance_id', 'execution_claim_request_id', 'execution_claimed_by');
```

3. Verify RPC exists:

```sql
SELECT routine_name
FROM information_schema.routines
WHERE routine_name = 'claim_autonomous_executor_for_run';
```

4. Execute the RPC manually (test):

```sql
SELECT claim_autonomous_executor_for_run(
  p_run_id := '<VALID_RUN_ID>'::uuid,
  p_claim_request_id := 'test-claim-req-001'
);
```

5. Verify response contains executor_instance_id (UUID format)

**Expected Result:**
- RPC exists and is callable
- Returns executor_instance_id (non-null UUID)
- execution_claimed_by is set in autonomous_task_runs
- execution_claim_request_id is set

**Evidence Capture:**
```
Screenshot: information_schema queries showing table/columns/RPC exist
Screenshot: RPC execution result showing executor_instance_id UUID
SQL query: SELECT execution_executor_instance_id FROM autonomous_task_runs WHERE id = '<RUN_ID>'
```

---

### Test 2C-3: Idempotent Claim Retry

**Objective:** Verify calling RPC twice with same claim_request_id returns same executor_instance_id.

**Steps:**

1. Create new autonomous task run (or use existing created-state run)
2. Call claim RPC first time:

```sql
SELECT result FROM claim_autonomous_executor_for_run(
  p_run_id := '<RUN_ID>'::uuid,
  p_claim_request_id := 'idempotent-test-123'
);
```

3. Note the returned executor_instance_id (e.g., `exec-abc-123`)
4. Call RPC again with SAME claim_request_id:

```sql
SELECT result FROM claim_autonomous_executor_for_run(
  p_run_id := '<RUN_ID>'::uuid,
  p_claim_request_id := 'idempotent-test-123'
);
```

5. Compare results: should be identical

**Expected Result:**
- First call: returns `exec-abc-123`
- Second call: returns `exec-abc-123` (same)
- RPC does not create duplicate executor claims

**Evidence Capture:**
```
Screenshot: Two SQL query results showing identical executor_instance_id
Note: response time might be different (second call may be faster due to caching)
```

---

### Test 2C-4: Concurrent Claims

**Objective:** Verify two simultaneous claim attempts on same run result in exactly one success.

**Steps:**

1. Create new autonomous task run (id: `run-concurrent-test`)
2. Open TWO separate database sessions (two terminal windows, or two Supabase SQL editor tabs)
3. In both sessions, run identical claim call:

```sql
BEGIN;
SELECT result FROM claim_autonomous_executor_for_run(
  p_run_id := 'run-concurrent-test'::uuid,
  p_claim_request_id := 'concurrent-test-txn-<SESSION_ID>'
);
-- DO NOT COMMIT YET
```

4. In Session A: execute the SELECT and watch it return a result
5. In Session B: execute the SELECT (should WAIT for Session A's transaction)
6. In Session A: COMMIT
7. In Session B: the SELECT now completes (either succeeds with different executor, or fails with "already claimed")

**Expected Result:**
- Session A: succeeds, returns executor_id
- Session B: either waits (if FOR UPDATE works), or returns error "already claimed"
- Exactly one executor_instance_id is assigned to the run

**Evidence Capture:**
```
Screenshot: Session A query result with executor_id
Screenshot: Session B showing wait/error state
File: concurrent_claim_test_log.txt (description of timing)
```

---

### Test 2D-1: countTokens API Called

**Objective:** Verify countTokens API is actually called before authorization.

**Steps:**

1. Execute autonomous task with paw-mode that uses Gemini
2. Open browser DevTools → Network tab
3. Filter for requests to `generativelanguage.googleapis.com`
4. Look for POST request to `/google.ai.generativelanguage.v1beta1/projects/*/locations/*/cachedContent` (cached content) or `/google.ai.generativelanguage.v1.GenerativeService/CountTokens`
5. Verify countTokens is called BEFORE generateContent

**Expected Request:**
```
POST https://generativelanguage.googleapis.com/v1beta1/projects/.../locations/.../cachedContent
Content-Type: application/json

{
  "systemInstruction": { "parts": [{ "text": "..." }] },
  "contents": [ ... ],
  "tools": [ ... ]
}
```

or 

```
POST https://generativelanguage.googleapis.com/v1/models/.../countTokens
Content-Type: application/json

{
  "systemInstruction": { "parts": [{ "text": "..." }] },
  "contents": [ ... ]
}
```

**Response:**
```json
{
  "totalTokens": 1234
}
```

**Evidence Capture:**
```
Screenshot: Network tab showing countTokens request/response
Screenshot: Timeline showing countTokens BEFORE generateContent
File: network_requests_2d1.har (export HAR file)
```

---

### Test 2D-5: countTokens Response Matches generateContent Usage

**Objective:** Verify countTokens.totalTokens ≈ generateContent.usageMetadata.promptTokenCount.

**Steps:**

1. Execute autonomous task
2. Capture both:
   - countTokens response: `totalTokens`
   - generateContent response: `usageMetadata.promptTokenCount`
3. Compare values

**Expected Result:**
- `countTokens.totalTokens` = 1234
- `generateContent.usageMetadata.promptTokenCount` ≈ 1234
- Small differences acceptable (Gemini may adjust based on actual formatting)

**Evidence Capture:**
```
Screenshot: Network tab showing countTokens response
Screenshot: Network tab showing generateContent response
File: comparison_2d5.txt (document side-by-side values)
```

---

### Test 2D-8: Fail-Closed Behavior

**Objective:** Verify authorization fails if countTokens fails (does NOT fallback).

**Steps:**

1. Identify the Gemini API key used in staging
2. Temporarily invalidate it (or use expired key in test)
3. Attempt to execute autonomous task
4. Verify:
   - countTokens call fails (401 Unauthorized or similar)
   - Authorization RPC fails with error
   - generateContent is NOT called
   - Task does not execute

**Expected Result:**
- Error in logs: "Exact token preflight failed" or "Cannot authorize request without precise token count"
- Task transitions to error state
- No charges to wallet
- No Gemini generateContent call made

**Evidence Capture:**
```
Screenshot: Authorization RPC error
Screenshot: Task status showing error
Log excerpt: "Exact token preflight failed"
File: staging_2d8_fail_closed.txt (error messages)
```

---

### Test E2E-1: Full Wallet Flow

**Objective:** Verify complete flow: wallet deduction → authorization → execution → settlement → wallet update.

**Steps:**

1. Check wallet balance before task:

```sql
SELECT 
  organization_id,
  balance,
  reserved
FROM autonomous_wallet_balances
WHERE organization_id = '<ORG_ID>'
LIMIT 1;
```

2. Execute autonomous task (simple, known cost)
3. Monitor:
   - Wallet reserved increases during execution
   - Usage event created during execution
   - Settlement calculated after completion
4. Check wallet balance after:

```sql
SELECT 
  organization_id,
  balance,
  reserved
FROM autonomous_wallet_balances
WHERE organization_id = '<ORG_ID>'
LIMIT 1;
```

5. Verify conservation invariant:
   - `before.balance = after.balance + settled`
   - `after.reserved = 0` (no active tasks)

**Example:**
```
Before: balance = 3000, reserved = 0, settled_today = 0
Execute: claim executor, authorize (reserve 410 PC), execute, settle 270 PC
After: balance = 2730, reserved = 0
Math: 3000 - 270 = 2730 ✓
```

**Evidence Capture:**
```
Screenshot: Balance before execution (3000 PC)
Screenshot: During execution (reserved = 410 PC)
Screenshot: After settlement (balance = 2730 PC)
Screenshot: Settlement record (amount = 270 PC)
Query: Conservation invariant calculation
```

---

### Test E2E-2: Billing Audit Trail

**Objective:** Verify complete audit trail from claim through settlement.

**Steps:**

1. Execute a full autonomous task
2. Query claim record:

```sql
SELECT *
FROM autonomous_task_run_claims
WHERE run_id = '<RUN_ID>'
LIMIT 1;
```

3. Query authorization record:

```sql
SELECT p_executor_instance_id, p_model, reserve_work_pc, created_at
FROM autonomous_model_request_authorizations
WHERE run_id = '<RUN_ID>'
ORDER BY created_at
LIMIT 1;
```

4. Query usage events:

```sql
SELECT run_id, executor_instance_id, normalized_compute, model, input_tokens, output_tokens
FROM usage_metering_events
WHERE run_id = '<RUN_ID>'
ORDER BY created_at DESC;
```

5. Query settlement:

```sql
SELECT run_id, pending_settlement, settled_work_pc, created_at
FROM autonomous_task_run_settlements
WHERE run_id = '<RUN_ID>'
LIMIT 1;
```

6. Verify chain:
   - claim.execution_executor_instance_id = auth.p_executor_instance_id
   - auth.p_executor_instance_id = usage.executor_instance_id
   - auth.p_model = usage.model
   - auth.reserve_work_pc ≥ settlement.pending_settlement

**Expected Result:**
- Unbroken chain from claim → auth → usage → settlement
- Executor ID consistent throughout
- Model consistent throughout
- Reservation >= settlement (conservative estimate)

**Evidence Capture:**
```
Screenshots: All four query results
File: audit_trail_e2e2.txt (documented chain with annotations)
```

---

### Test E2E-3: Resume After Insufficient Balance

**Objective:** Verify resuming from waiting_for_topup state claims fresh executor.

**Steps:**

1. Execute task with wallet balance just above estimated cost (e.g., 100 PC)
2. Task executes partially, hits insufficient balance
3. Status becomes waiting_for_topup
4. Check run state:

```sql
SELECT id, status, execution_executor_instance_id, execution_claimed_by
FROM autonomous_task_runs
WHERE id = '<RUN_ID>';
```

5. Top up wallet (add 1000 PC)
6. Resume task (via UI or RPC)
7. Check run state again (should have NEW executor_instance_id):

```sql
SELECT id, status, execution_executor_instance_id, execution_claimed_by
FROM autonomous_task_runs
WHERE id = '<RUN_ID>';
```

8. Task completes

**Expected Result:**
- First executor_instance_id = 'exec-abc-123'
- After topup, NEW executor_instance_id = 'exec-def-456' (different)
- No duplicate executors
- Task eventually completes

**Evidence Capture:**
```
Screenshot: Run state before topup (waiting_for_topup, executor_id = exec-abc-123)
Screenshot: Run state after resume (running, executor_id = exec-def-456)
Screenshot: Final settlement showing all usage attributed correctly
```

---

## EVIDENCE COMPILATION

After completing all tests, create a summary document:

### Summary Table

| Test ID | Name | Result | Evidence File | Notes |
|---------|------|--------|---|---|
| 2A-1 | Settlement Work PC | ✅ PASS | staging_2a1_settlement_workpc.txt | Verified 2.75 PC = 8.25 / 1000 / 0.30 × 100 |
| 2A-2 | Settlement Calculation | ✅ PASS | calculation_2a2.txt | Manual formula verification successful |
| 2B-1 | AIRouter Model Resolution | ⏳ NOT TESTED | - | No staging access to web app |
| ... | ... | ... | ... | ... |

### Critical Findings

List any:
- Mismatches between code and staging behavior
- Performance issues (timeouts, slow APIs)
- Billing discrepancies
- Model mismatch errors
- Token count discrepancies

### Recommendations

- Any fixes needed before production deployment
- Performance tuning suggestions
- Wallet balance recommendations for go-live

---

## COMMON ISSUES & TROUBLESHOOTING

### Issue: claim_autonomous_executor_for_run RPC not found

**Solution:**
1. Verify migration is applied: `SELECT version FROM schema_migrations WHERE name LIKE '%server_authoritative%'`
2. If not applied, run migration manually:
   ```sql
   \i supabase/migrations/20260907000000_server_authoritative_executor_claim.sql
   ```
3. Verify RPC exists: `\df claim_autonomous_executor_for_run`

### Issue: countTokens returns different token count than generateContent

**Solution:**
1. Verify EXACT same request structure is used (system instructions, history, tools, user input)
2. Check for formatting differences (whitespace, JSON structure)
3. Note: Small differences (< 5%) are acceptable due to Gemini's internal tokenization

### Issue: Settlement amount is wrong (e.g., returns 8.25 instead of 2.75)

**Solution:**
1. Verify `UsageEventStore.ts:83-101` is using `normalizedComputeToWorkPc()` conversion
2. Verify NOT returning raw `normalizedCompute` to settlement RPC
3. Check: (normalized / 1000 / 0.30 × 100) = Work PC
4. Verify pawComputePerUsd is not changing between execution and settlement

### Issue: Concurrent claim test shows two executors on one run

**Solution:**
1. Verify FOR UPDATE lock is in RPC (line ~130 in migration)
2. Check Postgres lock monitoring:
   ```sql
   SELECT * FROM pg_locks WHERE pid = <your_pid>;
   ```
3. Verify second transaction waits for first (not returns immediately)

### Issue: Executor ID not matching between claim and auth

**Solution:**
1. Verify claim RPC response includes `execution_executor_instance_id`
2. Verify HeadlessTurnRunner.ts:562 passes claimed executor to createAuthorizedProvider()
3. Verify authorize_autonomous_model_request RPC (line ~389) uses p_executor_instance_id

---

## SIGN-OFF

Once all tests complete:

1. **Fix any found issues** (if minor)
2. **Escalate blockers** (if major)
3. **Document results** in evidence files
4. **Create final report** (see next section)
5. **Ready for production?** YES / NO / WITH CAVEATS

---

## FINAL REPORT TEMPLATE

```markdown
# PHASE 2: STAGING VERIFICATION REPORT

**Date:** [completion date]
**Tester:** [name]
**Environment:** Staging (Supabase: [environment], Gemini API: [key version])
**Test Coverage:** [X]% of planned tests completed

## SUMMARY

| Category | Result | Count | Notes |
|----------|--------|-------|-------|
| Tests Completed | ✅ PASS | 20 / 20 | All critical paths verified |
| Warnings | ⚠️ MINOR | 2 | Performance tuning recommended |
| Blockers | ❌ NONE | 0 | Ready for production |

## Key Findings

### Phase 2A (Settlement)
- ✅ Settlement correctly receives Work PC (not normalized compute)
- ✅ Conversion formula verified: 70% margin applied correctly
- ✅ Conservation invariant holds (balance before = balance after + settled)

### Phase 2B (Model Identity)
- ✅ AIRouter resolves paw-mode correctly
- ✅ Authorization uses same model as execution (no fallback to hardcoded)
- ✅ All three paw modes (flash/swift/core) working end-to-end

### Phase 2C (Executor Claim)
- ✅ RPC generates UUID server-side
- ✅ Idempotency works (same claim_request_id returns same executor)
- ✅ Concurrency enforced (one executor per run via FOR UPDATE)
- ✅ Executor ID threads correctly through authorization

### Phase 2D (Token Preflight)
- ✅ countTokens API called before authorization
- ✅ countTokens request matches generateContent request
- ✅ No chars/4 heuristic used
- ✅ Fail-closed verified (countTokens failure blocks authorization)

### E2E Flow
- ✅ Complete wallet → claim → auth → execute → settle → wallet
- ✅ Audit trail unbroken (all records linked)
- ✅ Resume after topup works (fresh executor claimed)

## Evidence

All evidence files attached in `/staging_evidence_<date>/` directory:
- Network captures (HAR files)
- Database queries (SQL + results)
- Screenshots (UI state)
- Logs (API calls, errors)
- Calculation verification (spreadsheets)

## Sign-Off

✅ **APPROVED FOR PRODUCTION**

All Phase 2 objectives met. Code is correct, database operations work as designed, API integration successful.

Next step: Deploy to production and monitor billing for first 48 hours.
```

---

## SUCCESS CRITERIA

All tests must pass for Phase 2 to be considered production-ready:

- ✅ Phase 2A: Settlement formula verified with real data
- ✅ Phase 2B: Model identity end-to-end verified
- ✅ Phase 2C: Server-authoritative executor claim RPC works
- ✅ Phase 2D: countTokens API called and fail-closed behavior confirmed
- ✅ E2E: Complete wallet flow verified with conservation invariant
- ✅ Audit trail: Unbroken from claim through settlement
- ✅ No hardcoded fallbacks, heuristics, or dangerous legacy code

---

**Ready to begin staging verification? Run the tests in order (2A → 2B → 2C → 2D → E2E) and capture all evidence.**
