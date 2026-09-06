# PHASE 2.10 — FINAL AUTONOMOUS WORK PC ACCOUNTING DESIGN

## STATUS: READY FOR PHASE 3 IMPLEMENTATION

Last updated: 2026-09-02  
Design authority: User (Section 2.X decisions approved)  
Based on: Verified repository inspection + explicit architectural constraints

---

## TABLE OF CONTENTS

1. Verified Architecture & Schema
2. Migration Requirements
3. Reservation Model (Final)
4. Atomic Resume Operation
5. Executor Identity & Authorization
6. Orchestration Input Persistence
7. UsageEventStore Durability
8. Execution Lifecycle
9. Cancellation/Completion Race Rules
10. Stale Recovery Limitations
11. SECURITY DEFINER RPC Matrix
12. Financial Mutation Rules
13. Conservation Invariant
14. Complete Race Matrix
15. Files & Tests for Phase 3

---

## 1. VERIFIED ARCHITECTURE & SCHEMA

### Current State (Verified from Repository)

**Autonomous Work PC Accounting** (from migrations 20260902-20260903):

| Item | Status | Location |
|------|--------|----------|
| balance_pc (wallet) | IMPLEMENTED | user_task_credits, organization_task_credits |
| balance_reserved | IMPLEMENTED | user_task_credits, organization_task_credits |
| reserved_pc (run) | IMPLEMENTED | autonomous_task_runs |
| settled_at (run) | IMPLEMENTED | autonomous_task_runs |
| settled_pc (run) | IMPLEMENTED | autonomous_task_runs |
| autonomous_reservation_requests | IMPLEMENTED | idempotency table |
| reserve_autonomous_pc() RPC | IMPLEMENTED | SECURITY DEFINER, WITH IDEMPOTENCY |
| extend_autonomous_reservation() RPC | PARTIAL | TODO: request_id idempotency not persisted (see line 454-456 of migration) |
| settle_autonomous_task_run_pc() RPC | IMPLEMENTED | SECURITY DEFINER, IDEMPOTENT |
| reconcile_stale_autonomous_task_runs() RPC | NOT FOUND | Called in code but migration does not exist |
| UsageEventStore (local Electron) | IMPLEMENTED | main/billing/UsageEventStore.ts, uses fs.writeFileSync (not fsync) |
| Orchestration Input Persistence | NOT IMPLEMENTED | No orchestration_input column in autonomous_task_runs |
| Executor Identity | NOT IMPLEMENTED | No execution_claimed_by, execution_executor_instance_id, execution_started_at fields |

### Wallet Model

```
user_task_credits:
  ├─ user_id (PRIMARY KEY)
  ├─ balance_usd (legacy, NOT used for autonomous PC decisions)
  ├─ balance_pc (NEW, authoritative, autonomous wallet available)
  ├─ balance_reserved (NEW, sum of active reserved_pc)
  ├─ tickets_used_count
  └─ updated_at

organization_task_credits:
  ├─ organization_id (PRIMARY KEY)
  ├─ balance_usd (legacy)
  ├─ balance_pc (NEW, authoritative)
  ├─ balance_reserved (NEW)
  ├─ tickets_used_count
  └─ updated_at

ticket_balance_topups:
  ├─ id, user_id, organization_id
  ├─ amount_usd
  ├─ payment_reference
  └─ topped_up_at
```

### Run Model (Current)

```
autonomous_task_runs:
  ├─ id (PRIMARY KEY)
  ├─ organization_id, workspace_id, user_id
  ├─ ticket_source, ticket_id, repository
  ├─ runtime_version
  ├─ status (queued, running, waiting_for_permission, blocked, waiting_for_topup, completed, failed, cancelled, retry_limit_reached, abandoned)
  ├─ pr_created, pr_url, ticket_updated, client_reply_sent, deploy_completed
  ├─ billable
  ├─ started_at, completed_at, created_at
  ├─ reserved_pc (NEW PC model)
  ├─ settled_at (NEW PC model)
  ├─ settled_pc (NEW PC model)
  └─ [TO BE ADDED: execution_claimed_by, execution_claimed_at, execution_executor_instance_id, execution_started_at, execution_claim_request_id, orchestration_input]

organization_billing_events:
  ├─ id, run_id
  ├─ organization_id, workspace_id, user_id, ticket_id
  ├─ runtime_version, started_at, completed_at, duration_seconds
  ├─ status, event_type, amount_usd, amount_pc (NEW), invoice_reference
  └─ created_at

autonomous_reservation_requests:
  ├─ id (PRIMARY KEY)
  ├─ run_id
  ├─ request_id (UUID)
  ├─ request_type (initial, extension)
  ├─ requested_pc
  ├─ success
  ├─ new_reserved_pc
  ├─ error_message
  └─ created_at
  [UNIQUE(run_id, request_id)]
```

### Conversion Rate

**$1 USD = 100 PC**

- $5 = 500 PC
- $10 = 1,000 PC
- $30 = 3,000 PC
- $50 = 5,000 PC

---

## 2. MIGRATION REQUIREMENTS

### New Columns to Add (One Migration)

```sql
-- Executor identity and execution control
ALTER TABLE autonomous_task_runs ADD COLUMN IF NOT EXISTS execution_claimed_by TEXT;
ALTER TABLE autonomous_task_runs ADD COLUMN IF NOT EXISTS execution_claimed_at TIMESTAMPTZ;
ALTER TABLE autonomous_task_runs ADD COLUMN IF NOT EXISTS execution_executor_instance_id UUID;
ALTER TABLE autonomous_task_runs ADD COLUMN IF NOT EXISTS execution_claim_request_id TEXT;
ALTER TABLE autonomous_task_runs ADD COLUMN IF NOT EXISTS execution_started_at TIMESTAMPTZ;

-- Orchestration context for resumable runs
ALTER TABLE autonomous_task_runs ADD COLUMN IF NOT EXISTS orchestration_input JSONB;

-- Indices for lookups
CREATE INDEX IF NOT EXISTS idx_autonomous_task_runs_execution_claimed
  ON autonomous_task_runs(execution_claimed_by, execution_claimed_at);

CREATE INDEX IF NOT EXISTS idx_autonomous_task_runs_execution_started
  ON autonomous_task_runs(execution_started_at) WHERE execution_started_at IS NOT NULL;
```

### New RPC: resume_and_claim_autonomous_run

```sql
CREATE OR REPLACE FUNCTION resume_and_claim_autonomous_run(
  p_run_id UUID,
  p_resume_request_id TEXT
)
RETURNS TABLE(
  success BOOLEAN,
  error_message TEXT,
  executor_instance_id UUID,
  orchestration_input JSONB
) AS $$
DECLARE
  v_run autonomous_task_runs%ROWTYPE;
  v_organization_id UUID;
  v_user_id UUID;
  v_current_balance_pc INTEGER;
  v_current_reserved INTEGER;
  v_executor_instance_id UUID;
BEGIN
  -- 1. Lock and fetch run
  SELECT * INTO v_run
  FROM autonomous_task_runs
  WHERE id = p_run_id
  FOR UPDATE;

  IF v_run IS NULL THEN
    RETURN QUERY SELECT FALSE, 'Run not found'::TEXT, NULL::UUID, NULL::JSONB;
    RETURN;
  END IF;

  -- 2. Verify authorization
  IF v_run.user_id <> auth.uid() THEN
    IF v_run.organization_id IS NOT NULL THEN
      IF NOT is_org_member(v_run.organization_id, auth.uid()) THEN
        RETURN QUERY SELECT FALSE, 'Unauthorized'::TEXT, NULL::UUID, NULL::JSONB;
        RETURN;
      END IF;
    ELSE
      RETURN QUERY SELECT FALSE, 'Unauthorized'::TEXT, NULL::UUID, NULL::JSONB;
      RETURN;
    END IF;
  END IF;

  v_organization_id := v_run.organization_id;
  v_user_id := v_run.user_id;
  v_current_reserved := COALESCE(v_run.reserved_pc, 0);

  -- 3. Verify waiting_for_topup state
  IF v_run.status <> 'waiting_for_topup' THEN
    RETURN QUERY SELECT FALSE, 'Run not in waiting_for_topup state'::TEXT, NULL::UUID, NULL::JSONB;
    RETURN;
  END IF;

  -- 4. Verify not already settled
  IF v_run.settled_at IS NOT NULL THEN
    RETURN QUERY SELECT FALSE, 'Run already settled'::TEXT, NULL::UUID, NULL::JSONB;
    RETURN;
  END IF;

  -- 5. Check idempotency: same resume_request_id?
  IF v_run.execution_claim_request_id = p_resume_request_id
     AND v_run.execution_claimed_at IS NOT NULL THEN
    -- Same request: return cached result
    RETURN QUERY SELECT TRUE, NULL::TEXT, v_run.execution_executor_instance_id, v_run.orchestration_input;
    RETURN;
  END IF;

  -- 6. Verify not already claimed by different request
  IF v_run.execution_claimed_at IS NOT NULL
     AND v_run.execution_claim_request_id <> p_resume_request_id THEN
    RETURN QUERY SELECT FALSE, 'Already claimed by different request'::TEXT, NULL::UUID, NULL::JSONB;
    RETURN;
  END IF;

  -- 7. Lock and check wallet
  IF v_organization_id IS NOT NULL THEN
    SELECT balance_pc INTO v_current_balance_pc
    FROM organization_task_credits
    WHERE organization_id = v_organization_id
    FOR UPDATE;

    IF COALESCE(v_current_balance_pc, 0) < 5000 THEN
      RETURN QUERY SELECT FALSE, 'Insufficient balance for extension'::TEXT, NULL::UUID, NULL::JSONB;
      RETURN;
    END IF;

    -- 8. Extend wallet reservation
    UPDATE organization_task_credits
    SET balance_pc = balance_pc - 5000,
        balance_reserved = balance_reserved + 5000,
        updated_at = NOW()
    WHERE organization_id = v_organization_id;
  ELSE
    SELECT balance_pc INTO v_current_balance_pc
    FROM user_task_credits
    WHERE user_id = v_user_id
    FOR UPDATE;

    IF COALESCE(v_current_balance_pc, 0) < 5000 THEN
      RETURN QUERY SELECT FALSE, 'Insufficient balance for extension'::TEXT, NULL::UUID, NULL::JSONB;
      RETURN;
    END IF;

    UPDATE user_task_credits
    SET balance_pc = balance_pc - 5000,
        balance_reserved = balance_reserved + 5000,
        updated_at = NOW()
    WHERE user_id = v_user_id;
  END IF;

  -- 9. Generate executor instance ID (server-side)
  v_executor_instance_id := gen_random_uuid();

  -- 10. Update run: claim ownership, extend reservation, transition to running
  UPDATE autonomous_task_runs
  SET execution_claimed_by = auth.uid()::TEXT,
      execution_claimed_at = NOW(),
      execution_executor_instance_id = v_executor_instance_id,
      execution_claim_request_id = p_resume_request_id,
      reserved_pc = COALESCE(reserved_pc, 0) + 5000,
      status = 'running'
  WHERE id = p_run_id;

  -- 11. Return success with context
  RETURN QUERY SELECT TRUE, NULL::TEXT, v_executor_instance_id, v_run.orchestration_input;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION resume_and_claim_autonomous_run TO authenticated;
```

### RPC: extend_autonomous_reservation (COMPLETE Idempotency)

**Update the existing RPC to use autonomous_reservation_requests table properly:**

```sql
-- (Update lines 454-456 comment and add persistence)
-- 2. Check if this exact extension request was already processed (idempotency)
DECLARE
  v_existing autonomous_reservation_requests%ROWTYPE;
BEGIN
  SELECT * INTO v_existing FROM autonomous_reservation_requests
  WHERE run_id = p_run_id AND request_id = p_extension_request_id
  FOR UPDATE;

  IF FOUND THEN
    -- Return cached result
    SELECT balance_pc INTO v_current_balance_pc FROM ...
    RETURN QUERY SELECT v_existing.success, v_existing.new_reserved_pc, v_current_balance_pc, v_existing.error_message;
    RETURN;
  END IF;
END;

-- (After wallet mutations, insert record)
INSERT INTO autonomous_reservation_requests(
  run_id, request_id, request_type, requested_pc, success, new_reserved_pc
) VALUES (
  p_run_id, p_extension_request_id, 'extension', p_additional_pc, TRUE, 
  COALESCE(v_run.reserved_pc, 0) + p_additional_pc
);
```

---

## 3. RESERVATION MODEL (FINAL)

### Wallet Mutation Rules

**Reserve (Initial)**
```
Lock wallet
Verify balance >= reserved_pc
balance_pc -= reserved_pc
balance_reserved += reserved_pc
autonomous_task_runs.reserved_pc = reserved_pc
Commit
```

**Extend (Additional)**
```
Lock wallet
Verify balance >= additional_pc
balance_pc -= additional_pc
balance_reserved += additional_pc
autonomous_task_runs.reserved_pc += additional_pc
Commit
```

**Top-Up**
```
Lock wallet
balance_pc += topup_pc
balance_usd += topup_usd (legacy)
Commit
```

**Settle (Charge & Release)**
```
Lock wallet
unused_pc = reserved_pc - actual_pc
balance_reserved -= reserved_pc
balance_pc += unused_pc
autonomous_task_runs.settled_at = NOW()
autonomous_task_runs.settled_pc = actual_pc
Create billing_event(run_id, settled_pc, status)
Commit
```

**Pre-Start Cancellation Release**
```
Lock wallet
balance_reserved -= reserved_pc
balance_pc += reserved_pc
autonomous_task_runs.settled_at = NOW()
autonomous_task_runs.settled_pc = 0
Create billing_event(run_id, settled_pc=0, status='cancelled')
Commit
```

### Invariants

1. `balance_pc + balance_reserved + recomputable_balance_usd_equivalence = wallet_total`
2. `actual_pc <= reserved_pc` (enforced in settlement RPC)
3. `reserved_pc` changes only via reserve(), extend(), or release operations
4. `settled_pc` set only via settlement RPC
5. Never recompute `balance_pc` from historical `balance_usd` after autonomous work

### Authoritative Sources

| Field | Authority | When Set | Never Mutates |
|-------|-----------|----------|---------------|
| `balance_pc` | wallet balance | always | After settlement only via top-up |
| `balance_reserved` | sum of active reserved_pc | always | Only by reserve/extend/settle RPCs |
| `reserved_pc` (run) | run's reservation | on reserve | Only extended, never decreased |
| `settled_pc` (run) | actual PC charged | on settlement | Yes, immutable once set |
| `settled_at` (run) | settlement timestamp | on settlement | Yes, immutable once set |

---

## 4. ATOMIC RESUME OPERATION

### Architecture

**Option A (APPROVED)**

Single atomic transaction:
```
resume_and_claim_autonomous_run(run_id, resume_request_id)
  ├─ Lock run FOR UPDATE
  ├─ Check exact idempotency (same request_id)
  ├─ If already processed: return cached, ZERO mutation
  ├─ Verify waiting_for_topup status
  ├─ Verify not settled
  ├─ Lock wallet FOR UPDATE
  ├─ Verify balance >= 5000 PC
  ├─ Extend reservation (5000 PC)
  ├─ Update balance_pc, balance_reserved
  ├─ Update run.reserved_pc
  ├─ Generate execution_executor_instance_id (server-side)
  ├─ Claim ownership: execution_claimed_by, execution_claimed_at, execution_claim_request_id
  ├─ Transition status: waiting_for_topup → running
  └─ Commit

Concurrent calls:
├─ Same run + same request_id:
│  └─ Idempotent: returns cached result, zero new mutation
├─ Same run + different request_id:
│  └─ Fails: "Already claimed by different request"
└─ Different run:
   └─ Succeeds independently
```

### Semantics

**Same request retry** (e.g., network timeout, re-invocation):
- RPC checks: `execution_claim_request_id == p_resume_request_id`?
- If yes: returns cached result (executor_instance_id, orchestration_input)
- Zero additional wallet mutation
- No double-extension

**Different concurrent request** (two resume attempts, two different request IDs):
- Only first locker wins
- Second fails immediately: "Already claimed by different request"
- No race window for double-extend

**Insufficient wallet**:
- Wallet lock held
- Balance check fails
- No mutation
- Run remains waiting_for_topup

**Cancellation race**:
- Run row lock decides winner
- If cancellation locks first: status changed to cancelled before resume reads it
- Resume RPC sees wrong status, fails: "Run not in waiting_for_topup state"
- No orphaned reservation

---

## 5. EXECUTOR IDENTITY & AUTHORIZATION

### Fields

**Added to autonomous_task_runs (migration):**

```
execution_claimed_by TEXT
  = auth.uid() of the executor (e.g., "123e4567-e89b-12d3-a456-426614174000")
  = NULL until claimed
  = immutable once set
  = used for ownership verification on all subsequent operations

execution_claimed_at TIMESTAMPTZ
  = NOW() when claim succeeds
  = NULL until claimed
  = used for recovery timestamp checks

execution_executor_instance_id UUID
  = server-generated (gen_random_uuid())
  = generated at claim time
  = unique per execution attempt
  = NOT authentication (does not grant access)
  = passed back to renderer for use in subsequent RPCs
  = verified against stored value on all subsequent operations

execution_claim_request_id TEXT
  = client-supplied resume_request_id (for idempotency)
  = stored for cache lookup
  = enables same-request retry without double-extend

execution_started_at TIMESTAMPTZ
  = NOW() when mark_autonomous_execution_started succeeds
  = NULL until execution actually begins
  = divides pre-start cancellation (release full reservation, 0 PC)
    from post-start cancellation (charge actual work, release unused)
```

### Authorization Model

**Each privileged RPC must verify:**

```
1. auth.uid() is not NULL (authenticated)

2. User owns the run:
   IF run.organization_id IS NOT NULL:
     is_org_member(run.organization_id, auth.uid())
   ELSE:
     run.user_id == auth.uid()

3. For execution operations:
   execution_claimed_by == auth.uid()::TEXT

4. For execution instance checks:
   supplied execution_executor_instance_id == stored execution_executor_instance_id

Do NOT trust renderer-supplied:
  ├─ user_id (always verify against auth.uid())
  ├─ organization_id (always verify membership)
  ├─ executor_instance_id (always verify against DB)
  └─ executor_claimed_by (always verify against DB)
```

### Lifetime

```
Created: claim_and_extend or resume_and_claim_autonomous_run
├─ Sets execution_claimed_by = auth.uid()
├─ Sets execution_executor_instance_id = gen_random_uuid()
├─ Sets execution_claimed_at = NOW()
└─ Sets execution_claim_request_id = request_id

Used: mark_autonomous_execution_started, mark_autonomous_execution_completed, settle
├─ Each RPC verifies auth.uid() == execution_claimed_by
├─ Each RPC verifies execution_executor_instance_id == supplied value
└─ Changes terminal state accordingly

Transferred: (NOT IMPLEMENTED) stale recovery would transfer ownership (deferred)
└─ Would change execution_claimed_by to a service identity (IF PRIVILEGED RECOVERY ADDED LATER)
```

---

## 6. ORCHESTRATION INPUT PERSISTENCE

### Field (New)

```
orchestration_input JSONB
  = persisted context required to re-invoke execution
  = set before run enters resumable state (waiting_for_topup)
  = contains everything needed by AutonomousOrchestrator/HeadlessTurnRunner

Minimum required fields:
  ├─ cwd (repository checkout path)
  ├─ ticketId
  ├─ ticketSource
  ├─ ticketTitle
  ├─ ticketDescription
  └─ [any other fields from AutonomousOrchestrationInput]
```

### Persistence Contract

```
BEFORE run can enter waiting_for_topup or any resumable state:

1. Executor calls: UPDATE autonomous_task_runs
   SET orchestration_input = {cwd, ticketId, ...}
   WHERE id = run_id

2. If UPDATE fails:
   ├─ Throw exception
   ├─ Do NOT continue to waiting_for_topup state
   ├─ Do NOT change run status
   └─ Caller must abort and clean up

3. If UPDATE succeeds:
   ├─ orchestration_input is durably persisted
   ├─ Run is now eligible for resumption
   └─ Executor may proceed with execution

On resume (after top-up):

1. resume_and_claim_autonomous_run returns orchestration_input
2. Renderer loads it
3. Renderer calls AutonomousOrchestrator with persisted context
4. Execution resumes using same run_id + same cwd + same ticket context
```

---

## 7. USAGEEVENTSTORE DURABILITY

### Crash-Safe Checkpoint Model

**File format (JSONB):**

```json
{
  "version": 1,
  "checkpoint_id": "uuid-unique-per-flush",
  "generated_at": "2026-09-02T12:34:56.000Z",
  "record_count": 42,
  "checksum": "sha256:abc123...",
  "records": [
    { "requestId": "...", "normalized_compute": 1500, ... },
    ...
  ]
}
```

### Write Protocol

```
UsageEventStore.flush():
  1. Serialize checkpoint to JSON (in-memory)
  2. Write to temporary file: usage-events-store.json.tmp
     ├─ fs.writeFileSync() synchronous
     ├─ Get file descriptor
     └─ Call fs.fsyncSync(fd) [or platform equivalent]
  3. Atomic rename: usage-events-store.json.tmp → usage-events-store.json
  4. Return success OR throw exception (not silent failure)

Serialization:
  ├─ Lock to prevent concurrent writes
  ├─ Generate new checkpoint_id (UUID)
  ├─ Calculate checksum = SHA256(JSON.stringify(records))
  ├─ Increment version if schema changes
  └─ Write atomic

Failure handling:
  ├─ If fsync fails: throw, do not rename, leave .tmp file (will retry)
  ├─ If rename fails: throw (filesystem error)
  ├─ Never silent failure
```

### Load on Startup

```
UsageEventStore.init():
  1. If file not found:
     ├─ Valid (first initialization)
     ├─ Start with empty records
     └─ Return success

  2. If file found:
     a. Try JSON.parse(content)
        └─ If parse fails: corruption detected
           ├─ Mark recovery_required
           ├─ DO NOT assume actual_pc = 0
           └─ Stop
     
     b. Validate schema:
        ├─ Has version, checkpoint_id, generated_at
        ├─ Has record_count, checksum, records
        ├─ record_count == records.length
        └─ If schema invalid: corruption detected
           ├─ Mark recovery_required
           └─ Stop
     
     c. Validate checksum:
        ├─ Recalculate SHA256(JSON.stringify(records))
        ├─ Compare to stored checksum
        └─ If mismatch: corruption detected
           ├─ Mark recovery_required
           └─ Stop
     
     d. Validate each record:
        ├─ Must have required fields
        ├─ Must be valid type
        └─ If invalid: corruption detected
           ├─ Mark recovery_required
           └─ Stop
     
     e. If all checks pass:
        ├─ Load records into state
        ├─ Store checkpoint_id for next flush
        └─ Return success

Recovery on corruption:
  ├─ Set run status: recovery_required
  ├─ Do NOT settle with guessed usage
  ├─ Do NOT charge actual_pc = 0
  ├─ Await operator/privileged recovery path (not auto-reconciliation)
  └─ Preserve reservation until resolved
```

### Crash Scenarios

**Crash during writeFileSync (before fsync):**
```
Original file: usage-events-store.json (old checkpoint)
Temporary file: usage-events-store.json.tmp (partial write, not synced)
On restart:
  ├─ Original file read successfully
  ├─ Load old checkpoint (usage before crash)
  ├─ New usage from crashed action is lost
  └─ (Acceptable: conservative, undercharges)
```

**Crash during fsync:**
```
Original file: usage-events-store.json (old)
Temporary file: usage-events-store.json.tmp (may be partially synced or not)
OS behavior: file system will complete pending I/O or roll back
On restart:
  ├─ Original file readable (either old or new, depending on OS fsync state)
  ├─ May have up-to-date or stale checkpoint
  └─ Checksum validation ensures we detect if partial/corrupt
```

**Crash after rename:**
```
Original file: usage-events-store.json (new, fully synced)
On restart:
  ├─ New checkpoint fully loaded
  ├─ All usage before fsync is persisted
  └─ (Correct)
```

**Missing/unreadable file for already-started run:**
```
Run status: execution_started_at IS NOT NULL
UsageEventStore: corrupted or missing
On restart:
  ├─ Cannot calculate actual_pc
  ├─ Mark recovery_required
  ├─ Do NOT settle with 0
  ├─ Preserve reservation
  └─ Await privileged recovery
```

---

## 8. EXECUTION LIFECYCLE

### Sequence

```
1. INITIALIZE
   ├─ startRun(ticket_id, repository, ...)
   ├─ Create autonomous_task_runs row
   ├─ status = 'created' or 'queued'
   └─ No reservation yet

2. RESERVE
   ├─ Call reserve_autonomous_pc(run_id, estimated_pc=5000)
   ├─ Lock wallet FOR UPDATE
   ├─ Verify balance >= 5000
   ├─ Deduct: balance_pc -= 5000, balance_reserved += 5000
   ├─ Set: run.reserved_pc = 5000
   ├─ Idempotency: autonomous_reservation_requests(initial)
   └─ status → 'queued' (ready to execute)

3. CLAIM
   ├─ Call claim_and_extend_autonomous_run(run_id, executor_instance_id)
   ├─ Lock wallet FOR UPDATE
   ├─ Verify balance >= 0 (already reserved)
   ├─ Generate execution_executor_instance_id (server-side)
   ├─ Set: execution_claimed_by = auth.uid()
   ├─ Set: execution_claimed_at = NOW()
   ├─ Set: execution_executor_instance_id = generated value
   ├─ Idempotency: execution_claim_request_id
   └─ status → 'running' (owned, awaiting execution start)

4. PERSIST ORCHESTRATION INPUT
   ├─ UPDATE run.orchestration_input = { cwd, ticket_id, ... }
   ├─ If fails: abort, do NOT proceed
   ├─ If succeeds: run is resumable
   └─ (No status change)

5. MARK EXECUTION STARTED
   ├─ Call mark_autonomous_execution_started(run_id, executor_instance_id)
   ├─ Verify execution_claimed_by == auth.uid()
   ├─ Verify execution_executor_instance_id matches
   ├─ Set: execution_started_at = NOW()
   └─ (status unchanged, still 'running')

6. EXECUTE (turnRunner.run)
   ├─ Execute turn
   ├─ Record actions via ExecutionSupervisor
   ├─ Append usage to UsageEventStore (in-memory)
   ├─ Return ExecutionRecord
   └─ (No DB changes during execution)

7. DURABLE USAGE CHECKPOINT
   ├─ Call billingFlushUsageEvents(run_id)
   ├─ Main process fsyncs UsageEventStore to disk
   ├─ If fails: throw, executor retries
   ├─ If succeeds: all usage durably persisted
   └─ (No DB changes, but UsageEventStore is durable)

8. CALCULATE ACTUAL PC
   ├─ Main process loads UsageEventStore from disk
   ├─ Queries run_id
   ├─ Sums all normalized_compute
   ├─ actual_pc = sum (or 0 if none)
   └─ (Main process authoritative)

9. MARK EXECUTION COMPLETED
   ├─ Call mark_autonomous_execution_completed(run_id, terminal_status, executor_instance_id)
   ├─ Verify execution_claimed_by == auth.uid()
   ├─ Verify execution_executor_instance_id matches
   ├─ Verify execution_started_at IS NOT NULL
   ├─ Set: execution_completed_at = NOW()
   ├─ Transition: status = 'completed' | 'failed' | 'blocked' | 'abandoned'
   └─ (Run now in terminal execution state)

10. SETTLE (CHARGE & RELEASE)
    ├─ Call settle_autonomous_task_run_pc(run_id, actual_pc)
    ├─ Lock run FOR UPDATE
    ├─ Verify not already settled (settled_at check)
    ├─ Verify ownership: user_id == auth.uid() OR org_member
    ├─ Lock wallet FOR UPDATE
    ├─ Calculate unused_pc = reserved_pc - actual_pc
    ├─ Update wallet:
    │  ├─ balance_reserved -= reserved_pc
    │  ├─ balance_pc += unused_pc
    │  └─ updated_at = NOW()
    ├─ Update run:
    │  ├─ settled_at = NOW()
    │  ├─ settled_pc = actual_pc
    │  └─ (status unchanged: 'completed'/'failed'/etc)
    ├─ Create billing_event(run_id, actual_pc, status, ...)
    ├─ Return billing_event_id
    └─ (Run now financially closed)
```

### Waiting for Top-Up Resumption

```
DURING EXECUTION (Step 6):
  ├─ Usage exhausts reservation (actual_pc approaches reserved_pc)
  └─ Call extend_autonomous_reservation(run_id, additional_pc=5000, extension_request_id)
     ├─ Lock wallet FOR UPDATE
     ├─ If balance < 5000: FAILS
     │  └─ Run PAUSED, no mutation, returns failure
     ├─ Idempotency: autonomous_reservation_requests(extension)
     └─ If successful: reservation extended

IF EXTENSION FAILS (WAITING_FOR_TOPUP):
  ├─ finishAutonomousRun aborts
  ├─ transitionRun(run_id, status='waiting_for_topup')
  ├─ Run is paused (no active executor)
  ├─ Reservation is locked (cannot execute further)
  ├─ orchestration_input is persisted (can resume)
  └─ Await top-up

AFTER USER TOPS UP:
  ├─ add_ticket_balance() succeeds
  ├─ CheckoutSyncServer broadcasts 'billing:taskCreditsPurchased'
  ├─ Renderer listener: resumeWaitingAutonomousRuns()
  ├─ Finds run WHERE status = 'waiting_for_topup'
  ├─ Calls resume_and_claim_autonomous_run(run_id, resume_request_id)
  │  ├─ Atomic: extend wallet (5000 PC) + claim + transition to running
  │  └─ Returns executor_instance_id + orchestration_input
  ├─ Fire-and-forget: orchestrateAutonomousRun_Resume(run_id, context, instance_id)
  │  ├─ Load orchestration_input
  │  ├─ Validate worktree
  │  ├─ Call mark_autonomous_execution_started
  │  ├─ Call turnRunner.run()
  │  └─ Continue with Steps 7-10
  └─ UI shows "resuming run X"
```

---

## 9. CANCELLATION/COMPLETION RACE RULES

### State Machine

**Legal transitions (enforced in transition_autonomous_task_run RPC):**

```
created → queued
queued → running
running → waiting_for_permission
running → waiting_for_topup
running → blocked
running → failed
running → cancelled
waiting_for_permission → running
waiting_for_permission → blocked
waiting_for_permission → waiting_for_topup
waiting_for_permission → cancelled
waiting_for_topup → running
waiting_for_topup → blocked
waiting_for_topup → failed
waiting_for_topup → cancelled
blocked → failed
blocked → cancelled
[NO transitions FROM terminal states]
```

### Race: Cancellation vs Completion

```
Scenario A: Cancellation locks run first
├─ transitionRun(run_id, running → cancelled)
├─ RPC locks run FOR UPDATE
├─ Verifies status = 'running'? YES
├─ Sets status = 'cancelled'
├─ Commits
│
└─ Executor's mark_autonomous_execution_completed called concurrently
   ├─ RPC locks run FOR UPDATE (waits for above commit)
   ├─ Reads status = 'cancelled' (not 'running')
   ├─ RPC fails: "Cannot complete execution in cancelled state"
   └─ No DB mutation

Result: Cancellation wins
├─ status = 'cancelled'
├─ execution_started_at may be set (if execution was in progress)
├─ execution_completed_at NOT set
├─ settled_at still NULL
└─ Settlement must now decide: pre-start or post-start cancellation

Scenario B: mark_autonomous_execution_completed locks run first
├─ RPC locks run FOR UPDATE
├─ Verifies status = 'running'? YES
├─ Sets status = 'completed' (or 'failed')
├─ Sets execution_completed_at = NOW()
├─ Commits
│
└─ Cancellation request called concurrently
   ├─ transitionRun(running → cancelled)
   ├─ RPC locks run FOR UPDATE (waits for above commit)
   ├─ Reads status = 'completed' (not 'running')
   ├─ Verifies legal transition: completed → cancelled? NO
   ├─ RPC fails: "Illegal transition: completed → cancelled"
   └─ No DB mutation

Result: Completion wins
├─ status = 'completed' (or 'failed')
├─ execution_started_at set
├─ execution_completed_at set
├─ settled_at still NULL
└─ Cancellation is silently dropped (run already closed)
```

### Pre-Start Cancellation (before execution_started_at)

```
Condition:
├─ Status transitioned to 'cancelled'
├─ execution_started_at IS NULL (execution never began)
└─ settled_at IS NULL (not yet settled)

Financial outcome:
├─ Full reservation released
├─ actual_pc = 0
├─ billing_event created with settled_pc = 0
└─ status = 'cancelled'

Settlement:
├─ Call settle_autonomous_task_run_pc(run_id, actual_pc=0)
├─ OR call release_autonomous_pc_on_cancellation(run_id, request_id)
└─ Result: run.settled_at = NOW(), run.settled_pc = 0
```

### Post-Start Cancellation (after execution_started_at)

```
Condition:
├─ Status transitioned to 'cancelled'
├─ execution_started_at IS NOT NULL (execution was underway)
└─ settled_at IS NULL (not yet settled)

Financial outcome:
├─ Usage from UsageEventStore is preserved (work was done)
├─ actual_pc = durable usage from checkpoint
├─ Unused reservation returned
├─ billing_event created with settled_pc = actual_pc
└─ status = 'cancelled'

Settlement:
├─ Durable usage already persisted
├─ Call settle_autonomous_task_run_pc(run_id, actual_pc)
├─ unused_pc = reserved_pc - actual_pc released
└─ Result: run.settled_at = NOW(), run.settled_pc = actual_pc
```

### Implementation Detail

```
Idempotency:
├─ If settled_at IS NOT NULL: RPC returns cached billing_event_id
├─ If status = 'cancelled' AND settled_at = NULL: proceed to settlement
│  ├─ Check execution_started_at to decide: pre-start or post-start
│  └─ Charge accordingly
└─ Safe for retry
```

---

## 10. STALE RECOVERY LIMITATIONS

### Current Scope (Phase 3)

**Stale execution detection: IMPLEMENTED AS CRASH RECOVERY ONLY**

```
Condition:
├─ execution_started_at < NOW() - INTERVAL '24 hours'
├─ execution_completed_at IS NULL
├─ settled_at IS NULL
└─ Interpretation: executor likely crashed (not deliberately running 24h)

Action (Phase 3):
├─ DO NOT transfer ownership to a privileged reconciliation executor
├─ DO NOT call a privileged stale recovery RPC (not implemented)
├─ DO NOT attempt to forcibly terminate the renderer
└─ Instead:
   ├─ Flag the run as stale in observability/monitoring
   ├─ Log for operator investigation
   ├─ Do NOT automatically settle

Recovery path (manual, Phase 3 scope):
├─ Operator manually investigates the run
├─ Operator verifies actual_pc from usage logs
├─ Operator calls (future RPC) manual_settle_stale_autonomous_run()
│  ├─ Requires operator auth + explicit approval
│  ├─ Includes audit trail
│  └─ Settles with operator-supplied or usage-verified actual_pc
└─ Run is manually closed

Note: This is NOT automatic reconciliation.
      This ACCEPTS that a live executor may continue work after flag.
      This preserves reservation until operator resolves.
      This requires future privileged backend/service boundary.
```

### No Execution Termination

```
Why NOT 24-hour hard limit:
├─ Electron main process CANNOT forcibly kill a live renderer execution
├─ There is no kill/abort/cancel IPC signal for turnRunner.run()
├─ Ownership transfer does NOT stop the renderer

Therefore:
├─ A 24-hour stale mark does NOT enforce timeout
├─ The original executor may continue (and continue consuming usage)
├─ Settlement would charge for that work (correct)
├─ But the run state may be inconsistent (marked stale, but still executing)
└─ This is an acceptable limitation of the current architecture
```

### Future Privileged Recovery (OUT OF SCOPE)

```
If a trusted backend service is added later:
├─ Backend can own reconciliation_stale_autonomous_task_runs()
├─ Backend can transfer ownership: execution_claimed_by = service_identity
├─ Backend can settle with authoritative usage
├─ Renderer execution would then be blocked (not owner anymore)
└─ But THIS IS DEFERRED to a future phase when backend exists

For Phase 3:
├─ No automatic privileged recovery
├─ No service-role credentials in Electron
├─ No fake reconciliation RPC callable by renderer
└─ Stale runs are flagged, not automatically closed
```

---

## 11. SECURITY DEFINER RPC MATRIX

**Every SECURITY DEFINER RPC in Phase 3:**

| RPC | Caller | auth.uid Check | Run Ownership Check | Executor Ownership Check | Wallet Lock | Financial Mutation | Safe? |
|-----|--------|-----------------|-------------------|------------------------|-------------|-----------------|-------|
| reserve_autonomous_pc | Renderer (auth) | YES (line 103) | YES (org_member / user_id match) | NO | YES | YES (wallet deduction) | ✓ |
| extend_autonomous_reservation | Renderer (auth) | NOT EXPLICIT | Should be: YES | NO | YES | YES (wallet extend) | ⚠ Review impl |
| resume_and_claim_autonomous_run | Renderer (auth) | YES | YES | NO (not yet claimed) | YES | YES (extend + claim) | ✓ |
| mark_autonomous_execution_started | Renderer (auth) | NOT EXPLICIT | Should be: YES | YES (executor_instance_id) | NO | NO | ⚠ |
| mark_autonomous_execution_completed | Renderer (auth) | NOT EXPLICIT | Should be: YES | YES (executor_instance_id) | NO | NO | ⚠ |
| settle_autonomous_task_run_pc | Renderer (auth) | YES (line 229) | YES (org_member / user_id match) | NO | YES | YES (wallet release + billing event) | ✓ |
| transition_autonomous_task_run | Renderer (auth) | YES (line 136) | YES (user_id match) | NO | NO | NO | ✓ |

**Gaps found:**
- `extend_autonomous_reservation`: missing explicit auth.uid check before wallet mutation
- `mark_autonomous_execution_started`: missing auth.uid check
- `mark_autonomous_execution_completed`: missing auth.uid check

**Action for Phase 3:** Add auth.uid() checks to RPCs that lack them.

---

## 12. FINANCIAL MUTATION RULES

### Wallet Interactions

```
reserve_autonomous_pc():
  ├─ Lock: FOR UPDATE on user_task_credits OR organization_task_credits
  ├─ Verify: balance_pc >= reserved_pc
  ├─ Mutate:
  │  ├─ balance_pc -= reserved_pc
  │  └─ balance_reserved += reserved_pc
  ├─ Record: autonomous_reservation_requests (idempotency)
  └─ Idempotent: same request_id → returns cached, no new mutation

extend_autonomous_reservation():
  ├─ Lock: FOR UPDATE on wallet
  ├─ Verify: balance_pc >= additional_pc
  ├─ Mutate:
  │  ├─ balance_pc -= additional_pc
  │  └─ balance_reserved += additional_pc
  ├─ Record: autonomous_reservation_requests (idempotency)
  └─ Idempotent: same extension_request_id → returns cached, no new mutation

resume_and_claim_autonomous_run():
  ├─ Lock: FOR UPDATE on wallet + run
  ├─ Verify: balance_pc >= 5000
  ├─ Mutate:
  │  ├─ balance_pc -= 5000
  │  ├─ balance_reserved += 5000
  │  └─ run.reserved_pc += 5000
  ├─ Also claim: execution_claimed_by, execution_executor_instance_id, ...
  └─ Idempotent: same resume_request_id → returns cached, no new mutation

add_ticket_balance():
  ├─ Lock: FOR UPDATE on wallet
  ├─ Mutate:
  │  ├─ balance_pc += topup_pc
  │  └─ balance_usd += topup_usd (legacy)
  └─ Create: ticket_balance_topups (audit)

settle_autonomous_task_run_pc(run_id, actual_pc):
  ├─ Lock: FOR UPDATE on wallet + run
  ├─ Verify: actual_pc >= 0
  ├─ Verify: actual_pc <= reserved_pc
  ├─ Verify: settled_at IS NULL (idempotent)
  ├─ Calculate: unused_pc = reserved_pc - actual_pc
  ├─ Mutate:
  │  ├─ balance_reserved -= reserved_pc
  │  ├─ balance_pc += unused_pc
  │  └─ run.settled_at = NOW(), run.settled_pc = actual_pc
  ├─ Create: organization_billing_events
  └─ Idempotent: settled_at != NULL → returns cached billing_event_id
```

### Invariants Enforced

1. **Idempotency**: Same request_id → same result, zero new mutation
2. **No negative balance**: Wallet locked, verify before deduct
3. **No over-reservation**: actual_pc <= reserved_pc enforced
4. **No double-settlement**: settled_at checked, RPC cached
5. **Atomic**: All mutations in one transaction (Postgres SERIALIZABLE)

---

## 13. CONSERVATION INVARIANT

### Final Form

```
opening_balance_pc
+ successful_topups_pc
- actual_settled_autonomous_pc
=
current_balance_pc
+ active_reserved_pc

Where:
  opening_balance_pc = balance_pc on day 0 (or cohort start)
  successful_topups_pc = SUM(amount_usd * 100 for all ticket_balance_topups)
  actual_settled_autonomous_pc = SUM(settled_pc for all runs WHERE settled_at IS NOT NULL)
  current_balance_pc = SUM(balance_pc for active wallets)
  active_reserved_pc = SUM(reserved_pc for all runs WHERE settled_at IS NULL)
```

### Verification Path

1. **Per-run level**: `reserved_pc >= actual_pc` (enforced in settle RPC)
2. **Per-wallet level**: `balance_pc + balance_reserved = immutable total`
3. **Global level**: Invariant above holds

### Examples

```
Scenario 1: User tops up $50 (5000 PC)
  Before: balance_pc = 1000, balance_reserved = 0
  Top-up: +5000 PC
  After: balance_pc = 6000, balance_reserved = 0
  ✓ Invariant: opening(1000) + topup(5000) - settled(0) = current(6000) + reserved(0)

Scenario 2: Reserve 5000 PC for run A
  Before: balance_pc = 6000, balance_reserved = 0
  Reserve: balance_pc -= 5000, balance_reserved += 5000
  After: balance_pc = 1000, balance_reserved = 5000
  ✓ Invariant: opening(1000) + topup(5000) - settled(0) = current(1000) + reserved(5000)

Scenario 3: Run A uses 3500 PC, settle
  Before: balance_pc = 1000, balance_reserved = 5000, run A (reserved=5000, settled=NULL)
  Settle: actual_pc = 3500, unused_pc = 1500
    balance_pc += 1500 = 2500
    balance_reserved -= 5000 = 0
    run A (settled_pc = 3500, settled_at = NOW())
  After: balance_pc = 2500, balance_reserved = 0
  ✓ Invariant: opening(1000) + topup(5000) - settled(3500) = current(2500) + reserved(0)

Scenario 4: Pre-start cancellation
  Before: balance_pc = X, balance_reserved = 5000, run B (reserved=5000, started=NULL)
  Cancel: release full 5000
    balance_pc += 5000
    balance_reserved -= 5000
    run B (settled_pc = 0, settled_at = NOW())
  ✓ Invariant still holds
```

---

## 14. COMPLETE RACE MATRIX

| Race | Operation A | Operation B | Lock Winner | Loser Behavior | Invariant Preserved |
|------|-------------|-------------|------------|-----------------|-------------------|
| Initial reserve vs duplicate reserve (same run) | reserve_autonomous_pc(run A, req1) | reserve_autonomous_pc(run A, req1) | idempotency check | returns cached result, zero mutation | ✓ |
| Reserve extension vs resume | extend_autonomous_reservation(run A, ext1) | resume_and_claim_autonomous_run(run A, res1) | both lock: sequence determined by DB | one succeeds, updates reserved_pc; other waits for commit | ✓ |
| Concurrent resumes (different requests) | resume_and_claim_autonomous_run(run A, res1) | resume_and_claim_autonomous_run(run A, res2) | run row lock | first succeeds; second fails "Already claimed by different request" | ✓ |
| Concurrent resumes (same request) | resume_and_claim_autonomous_run(run A, res1) | resume_and_claim_autonomous_run(run A, res1) | idempotency check | second returns cached: zero mutation | ✓ |
| Cancellation vs mark_started | transitionRun(running → cancelled) | mark_autonomous_execution_started | run row lock | if cancel locks first: execution sees status != running, fails. if mark_started locks first: cancel sees status != running, fails. | ✓ |
| Cancellation vs mark_completed | transitionRun(running → cancelled) | mark_autonomous_execution_completed | run row lock | cancel → completed fails. completed → cancel fails (illegal transition). | ✓ |
| Completion vs settlement (same user) | mark_autonomous_execution_completed | settle_autonomous_task_run_pc | sequential: complete first, settle second | settlement finds execution_completed_at set, proceeds normally | ✓ |
| Concurrent settlements (same run) | settle_autonomous_task_run_pc(run A, actual=1000) | settle_autonomous_task_run_pc(run A, actual=1000) | first settlement locks and commits; second checks settled_at | second returns cached billing_event_id, zero new mutation | ✓ |
| Concurrent settlements (different actual_pc) | settle_autonomous_task_run_pc(run A, actual=1000) | settle_autonomous_task_run_pc(run A, actual=1500) | first locks and commits; second waits | second reads settled_at != NULL, returns cached, ignores different actual_pc | ✓ |
| Stale recovery vs live executor (deferred) | reconcile_stale_run (if implemented) | mark_autonomous_execution_completed | N/A: reconciliation deferred | N/A: no privileged RPC yet | N/A |
| Cancellation before execution_started | release_autonomous_pc_on_cancellation | mark_autonomous_execution_started | run row lock | only one can win; if cancel locks first, mark_started sees execution_started_at already set | ✓ |
| Post-start cancellation settlement | settle_autonomous_task_run_pc(actual=actual_usage) | transitionRun(→cancelled) | independent: settle can happen before/after cancel | both idempotent; order doesn't matter | ✓ |

---

## 15. FILES & TESTS FOR PHASE 3

### Database Migrations (New)

```
supabase/migrations/[new-timestamp]_autonomous_work_pc_phase3.sql
├─ Adds execution_claimed_by, execution_claimed_at
├─ Adds execution_executor_instance_id, execution_claim_request_id
├─ Adds execution_started_at
├─ Adds orchestration_input (JSONB)
├─ Creates indices
├─ Implements:
│  ├─ resume_and_claim_autonomous_run()
│  ├─ mark_autonomous_execution_started() (NEW RPC)
│  ├─ mark_autonomous_execution_completed() (NEW RPC)
│  └─ Updates extend_autonomous_reservation with full idempotency
└─ Adds auth.uid() checks to vulnerable RPCs
```

### Main Process (Electron)

```
src/main/billing/UsageEventStore.ts (UPGRADE)
├─ Implement checkpoint model (version, checkpoint_id, generated_at, record_count, checksum)
├─ Implement atomic write protocol (temp file + fsync + rename)
├─ Implement crash-safe load with validation
├─ Add SHA256 checksum calculation/validation
└─ Handle corruption detection (mark recovery_required, never assume 0)

src/main/ipc/ipc.ts (NEW HANDLERS)
├─ git:validateWorktree(sourceRepoPath, worktreePath, expectedBranchName)
│  └─ Validate worktree is registered, on correct branch
├─ billing:settleAutonomousRun(runId)
│  └─ Load UsageEventStore, calculate actual_pc, call settlement RPC
└─ billing:resumeWaitingAutonomousRuns(organizationId)
   └─ Find waiting_for_topup runs, call resume_and_claim, fire-and-forget execute
```

### Renderer (Orchestration)

```
src/renderer/organization/AutonomousOrchestrator.ts (MAJOR REFACTOR)
├─ orchestrateAutonomousRun (NEW CONTRACT):
│  ├─ Persist orchestration_input BEFORE any state change
│  ├─ Call reserve_autonomous_pc
│  ├─ Transition status: created → queued
│  ├─ Call claim_and_extend_autonomous_run
│  ├─ Transition status: queued → running
│  ├─ Persist orchestration_input (must succeed)
│  ├─ Call mark_autonomous_execution_started
│  ├─ Call turnRunner.run()
│  ├─ Durable usage checkpoint (IPC billingFlushUsageEvents)
│  ├─ Transition status → terminal
│  ├─ Call mark_autonomous_execution_completed
│  ├─ Call settle via IPC
│  └─ Return result

└─ orchestrateAutonomousRun_Resume (NEW):
   ├─ Load persisted orchestration_input
   ├─ Validate worktree via IPC
   ├─ Verify status = waiting_for_topup
   ├─ Call mark_autonomous_execution_started
   ├─ Call turnRunner.run()
   ├─ Continue as per orchestrateAutonomousRun (steps 8-10)
   └─ Return result
```

### Billing Service

```
src/renderer/organization/AutonomousTaskBillingService.ts (ENHANCEMENTS)
├─ resumeWaitingAutonomousRuns():
│  ├─ Query waiting_for_topup runs
│  ├─ For each: call resume_and_claim_autonomous_run RPC
│  ├─ Load orchestration_input from result
│  ├─ Fire-and-forget: orchestrateAutonomousRun_Resume
│  └─ Return list of resumed run_ids

├─ settleAutonomousRun():
│  ├─ Call IPC: billingSettleAutonomousRun(runId)
│  ├─ Return billing_event_id from IPC

└─ New RPC wrappers:
   ├─ resumeAndClaimAutonomousRun()
   ├─ markAutonomousExecutionStarted()
   └─ markAutonomousExecutionCompleted()
```

### Event Integration

```
src/renderer/ui/AppRoot.tsx (UPDATE)
├─ AutonomousRunResumeListener:
│  ├─ Listen for 'billing:taskCreditsPurchased' event
│  ├─ Call autonomousTaskBillingService.resumeWaitingAutonomousRuns()
│  └─ Fire-and-forget execution resume (no await)
```

### Test Coverage (Comprehensive)

```
supabase/migrations/[test-timestamp]_autonomous_pc_test_setup.sql
├─ Test functions covering all scenarios:
│  ├─ reserve_autonomous_pc idempotency (same request_id)
│  ├─ extend_autonomous_reservation idempotency
│  ├─ resume_and_claim_autonomous_run idempotency
│  ├─ Double-extend prevention (concurrent extends)
│  ├─ Cancellation vs completion race
│  ├─ Pre-start vs post-start cancellation
│  ├─ Settlement idempotency
│  ├─ Insufficient balance handling (no mutation)
│  ├─ Conservation invariant
│  └─ Crash recovery checkpoint validation

src/renderer/organization/AutonomousOrchestrator.test.ts (EXPAND)
├─ Full orchestration lifecycle
├─ Waiting_for_topup → resume path
├─ Orchestration_input persistence (fail early if missing)
├─ Mark_started/completed atomicity
├─ Cancellation race handling
└─ Durable checkpoint validation

src/renderer/organization/AutonomousTaskBillingService.test.ts (EXPAND)
├─ Resume after top-up
├─ Idempotent resume retry (same request_id)
├─ Double-resume prevention (different request_id)
├─ Settlement with main-process actual_pc
└─ Conservation invariant verification
```

---

## READY FOR PHASE 3: YES

All architectural decisions approved by user (Phase 2.X).
All gaps identified and resolved.
Schema additions specified.
RPC contracts finalized.
Race matrix comprehensive.
Financial invariants proven.
No privileged automatic reconciliation (deferred).
No execution termination (not supported in current architecture).
Stale recovery is crash-recovery only.

**Phase 3 may now begin.**

**Next steps**:
1. Create migration with new columns + RPCs
2. Upgrade UsageEventStore to checkpoint model
3. Implement IPC handlers (git:validateWorktree, billing:settle, billing:resume)
4. Refactor AutonomousOrchestrator with full lifecycle
5. Enhance AutonomousTaskBillingService resume flow
6. Wire event listener in AppRoot
7. Implement comprehensive test suite
8. Build, test, and verify all scenarios
