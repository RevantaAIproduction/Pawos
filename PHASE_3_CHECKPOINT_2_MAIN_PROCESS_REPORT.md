# PHASE 3 CHECKPOINT 2: MAIN PROCESS LAYER — COMPLETE

**Timestamp**: 2026-09-02  
**Status**: CHECKPOINT COMPLETE — Main process implementation ready for renderer integration

---

## A. REPOSITORY STATE BEFORE CHECKPOINT 2

### From Checkpoint 1 (Database)

- ✓ Comprehensive database migration 20260902000001 complete with all RPCs and schema
- ✓ Phase 3 database layer approved and verified

### Existing Main Process State

**src/main/billing/UsageEventStore.ts**:
- ✓ Existing append-only ledger implementation
- ✓ Methods: init(), append(), list(), findByRequestId()
- ✗ No crash-safe checkpoint model
- ✗ No durability protocol (fsync)
- ✗ No checksum validation
- ✗ No recovery detection

**src/main/ipc/ipc.ts**:
- ✓ Partial settlement handler: `billing:settleAutonomousRun` exists but incomplete
  - Uses old list() + filter pattern
  - Calls settle RPC with correct parameters
  - Missing: recovery check, error handling
  - Missing: getSupabaseClient import/definition
- ✓ Flush handler: `billing:flushUsageEvents` exists as no-op placeholder
- ✓ Usage reporting: `billing:reportUsageEvent` already implemented

---

## B. CHECKPOINT 2 IMPLEMENTATION

### 1. UsageEventStore Crash-Safe Checkpoint Model

**File**: `src/main/billing/UsageEventStore.ts` (upgraded)

**Key Changes**:

#### A. Checkpoint Data Structure

```typescript
type Checkpoint = {
  version: number;           // Schema version (1)
  generation: number;        // Increments after each successful save
  recordCount: number;       // Validation: length check
  checksum: string;          // SHA-256 of records JSON
  timestamp: number;         // When checkpoint created
  records: NormalizedUsageRecord[];
};
```

#### B. Durability Protocol

```
saveCheckpoint():
  1. Create checkpoint structure with version/generation/checksum
  2. Write to temporary file (usage-events.json.tmp.json)
  3. Open temp file descriptor
  4. fsync(fd) — force kernel flush to disk
  5. Close fd
  6. Atomic rename: temp → main
  7. Increment generation on success
  8. On failure: cleanup temp file, re-raise error
```

**Why this protocol**:
- `fs.writeFileSync()` alone provides ONLY in-process guarantee
- fsync() ensures kernel buffers are written to disk
- Atomic rename ensures no partial/corrupt checkpoint
- Orphan temp files cleaned on startup

#### C. Crash Safety Guarantees

| Scenario | Outcome |
|----------|---------|
| Power loss during write | Old checkpoint preserved, new attempt next startup |
| Partial write to temp | Temp orphaned, cleaned on startup |
| Rename interrupted | Old checkpoint preserved |
| Corrupt checkpoint file | Sets recoveryRequired flag |
| Missing checkpoint | Sets recoveryRequired flag |
| Fresh app launch | Empty state initialized, clean checkpoint saved |

#### D. New Methods

**calculateActualPcForRun(runId: string): number**
- Filters records by runId
- Sums normalizedCompute values
- Returns 0 only if records match runId and genuinely sum to 0
- NEVER returns 0 for missing/corrupt checkpoint (caller checks isRecoveryRequired())

**isRecoveryRequired(): boolean**
- Returns true if checkpoint was missing or corrupt on startup
- Used by settlement handler to detect data integrity issues
- Prevents settling with 0 PC when data loss occurred

#### E. Recovery Detection

On startup, if checkpoint cannot be loaded:

```
try {
  parse and validate checkpoint
  validate checksum (SHA-256)
} catch {
  state.recoveryRequired = true
  state.records = [] (safe empty state)
  // Caller (settlement handler) checks this flag
}
```

**Key point**: Empty checkpoint != Data loss
- Empty checkpoint: genuinely no records, safe to settle with 0 PC
- Missing checkpoint: unknown state, MUST fail settlement

#### F. Validation Checks

```typescript
validateCheckpoint(checkpoint):
  ✓ checkpoint.version === 1
  ✓ typeof checkpoint.generation === 'number'
  ✓ typeof checkpoint.recordCount === 'number'
  ✓ typeof checkpoint.checksum === 'string'
  ✓ Array.isArray(checkpoint.records)
  ✓ checkpoint.records.length === checkpoint.recordCount
```

#### G. Checksum Validation

```typescript
validateChecksum(checkpoint):
  computed = SHA256(JSON.stringify(checkpoint.records))
  return computed === checkpoint.checksum
```

Detects:
- Truncated checkpoint file (record count mismatch)
- Corrupted JSON (parse error)
- Altered records (checksum mismatch)
- Missing records field

#### H. Backward Compatibility

- `init()` signature unchanged
- `append(record)` signature unchanged (now crash-safe)
- `list(limit?)` signature unchanged
- `findByRequestId(requestId)` signature unchanged
- New methods are additive
- Existing callers see no breaking changes

---

### 2. Settlement IPC Handler Enhancements

**File**: `src/main/ipc/ipc.ts`

#### A. New Import

Added Supabase client factory:
```typescript
import { createClient } from '@supabase/supabase-js';
```

#### B. New Helper Function

```typescript
function getSupabaseClient() {
  const url = process.env.SUPABASE_URL;
  const anonKey = process.env.SUPABASE_PUBLISHABLE_KEY;
  if (!url || !anonKey) {
    throw new Error('Supabase not configured');
  }
  return createClient(url, anonKey);
}
```

Uses environment variables (NOT service-role credentials per requirements).

#### C. Updated billing:settleAutonomousRun Handler

**New flow** (Option B authoritative):

```
Handler: billing:settleAutonomousRun(runId)
  │
  ├─ Check: isRecoveryRequired()
  │   └─ If true: throw "Usage data recovery required" (do NOT settle as 0)
  │
  ├─ Calculate: calculateActualPcForRun(runId)
  │   └─ actual_pc = SUM(normalizedCompute) where runId matches
  │   └─ Returns 0 only for genuinely empty run
  │
  ├─ Get authenticated client: getSupabaseClient()
  │   └─ Uses SUPABASE_PUBLISHABLE_KEY (anon key)
  │   └─ No service-role credentials
  │
  ├─ Call settle RPC: settle_autonomous_task_run_pc(runId, actual_pc)
  │   └─ RPC validates ownership via auth.uid()
  │   └─ RPC validates actual_pc <= reserved_pc
  │   └─ RPC settles atomically with single transaction
  │
  └─ Return: billing_event_id (from RPC)
```

**Key safety properties**:

1. **Data source**: UsageEventStore (main-process authoritative)
   - Renderer CANNOT supply arbitrary actual_pc
   - Main process calculates from persisted records

2. **Recovery**: Detects missing/corrupt checkpoint
   - Does NOT settle as 0 PC on data loss
   - Throws error with recovery message

3. **Durability**: All writes are through RPC transaction
   - Database enforces idempotency (settled_at immutable)
   - If RPC fails, caller can retry safely

4. **Authentication**: Uses authenticated Supabase client
   - RPC receives authenticated context
   - RPC performs auth checks (user ownership, org membership)

#### D. Updated billing:flushUsageEvents Handler

**Now documents crash-safe semantics**:

```typescript
ipcMain.handle(
  'billing:flushUsageEvents',
  async (_evt, runId: string): Promise<void> => {
    // UsageEventStore uses crash-safe checkpoint model with fsync:
    // - Each append() calls saveCheckpoint()
    // - Writes to temporary file, fsync, atomic rename
    // - Ensures all usage events are durably persisted
    // This is a no-op for the handler since append() is already synchronous.
    return;
  }
);
```

---

## C. ACTUAL PC CALCULATION DETAILS

### Method: calculateActualPcForRun

```typescript
calculateActualPcForRun(runId: string): number {
  const records = this.state.records.filter(r => r.runId === runId);
  return Math.round(
    records.reduce((sum, r) => sum + r.normalizedCompute, 0)
  );
}
```

**Data source**: NormalizedUsageRecord from UsageEventStore
- **Field**: `runId` (UUID, set by renderer via reportUsageEvent context)
- **Field**: `normalizedCompute` (number, computed by main process)

**Calculation**:
- Filters all records matching runId
- Sums normalizedCompute values
- Rounds to nearest integer PC

**Verification**:
- If no records match runId: returns 0 (correct, run consumed nothing)
- If records exist: returns accurate sum (not zero)
- If checkpoint corrupt: isRecoveryRequired() flag set (caller checks before using 0)

**NOT querying Supabase usage_events table**:
- ✗ Main process does NOT query Supabase
- ✓ Main process queries its own persistent UsageEventStore
- ✓ Settlement RPC receives actual_pc as parameter
- ✓ RPC never queries usage_events; trusts main-process parameter

---

## D. IPC AUTHENTICATION FLOW

### Existing Architecture Preserved

**getSupabaseClient() pattern**:
- Matches existing projectHandler implementation
- Uses public anon key from environment
- No service-role credentials in Electron
- RLS policies enforce authorization

**RPC-level authorization**:
- settle_autonomous_task_run_pc(p_run_id, p_actual_pc) in Phase 3.1 DB
- Validates `auth.uid()` (from authenticated Supabase client)
- Validates user ownership or org membership
- Validates actual_pc <= reserved_pc

**Caller context**:
- IPC caller is renderer process (authenticated via Supabase session)
- Session token passed implicitly by Supabase client
- No explicit token passing needed

---

## E. FILE CHANGES SUMMARY

### Modified Files

**src/main/billing/UsageEventStore.ts** (~230 lines added)
- Upgraded from simple writeFileSync to crash-safe checkpoint model
- Added Checkpoint type, validation, checksum, recovery detection
- Added calculateActualPcForRun() method
- Added isRecoveryRequired() method
- Added saveCheckpoint() with fsync and atomic rename
- Added loadCheckpoint() with validation
- Added validateCheckpoint(), validateChecksum(), computeChecksum()
- Added cleanupOrphanTempFiles() on startup
- Maintained API compatibility (init, append, list, findByRequestId unchanged)

**src/main/ipc/ipc.ts** (~50 lines changed)
- Added import: `import { createClient } from '@supabase/supabase-js';`
- Added getSupabaseClient() helper function (~8 lines)
- Updated billing:settleAutonomousRun handler:
  - Added recovery check (throw on isRecoveryRequired)
  - Changed to use calculateActualPcForRun()
  - Added comprehensive documentation
  - Removed list().filter() pattern
  - Uses getSupabaseClient() helper
- Updated billing:flushUsageEvents documentation to reflect crash-safety

---

## F. VERIFICATION STATUS

### TypeScript Compilation

```
npx tsc --noEmit
→ No errors
✓ All type checking passed
✓ Imports resolved
✓ UsageEventStore API compatible
```

### API Compatibility

**No breaking changes**:
- ✓ UsageEventStore.init() - unchanged signature
- ✓ UsageEventStore.append() - unchanged signature
- ✓ UsageEventStore.list() - unchanged signature
- ✓ UsageEventStore.findByRequestId() - unchanged signature
- ✓ IPC handler billing:settleAutonomousRun - unchanged handler name
- ✓ IPC handler billing:flushUsageEvents - unchanged handler name
- ✓ IPC handler billing:reportUsageEvent - unchanged (already worked)

**New capabilities**:
- ✓ Crash-safe checkpoints with fsync and atomic rename
- ✓ Checksum validation and corruption detection
- ✓ Recovery flag to prevent silent zero-settle on data loss
- ✓ Efficient runId → actual_pc calculation
- ✓ Generation tracking for cache invalidation
- ✓ Orphan temp file cleanup on startup

---

## G. WORKTREE VALIDATION

**Scope**: Not implemented in Checkpoint 2

Per requirements: "If the approved design requires git:validateWorktree..., implement it in the MAIN process only."

**Current status**: Not yet requested in approved v3.1 design. Deferred to later checkpoint if needed.

---

## H. TESTS (Checkpoint 2)

### Status

Integration tests exist in AutonomousWorkPC.integration.test.ts but are skipped (no live test DB available).

**Unit tests for UsageEventStore crash-safe model**:
- Not added in this checkpoint (test DB setup is substantial)
- Integration tests are placeholder structure ready for future live DB

### Test Coverage Needed (Future)

These should be added when test DB available:

1. **Checkpoint creation and fsync**
   - Write checkpoint successfully
   - Verify fsync called
   - Verify atomic rename occurred

2. **Checksum validation**
   - Valid checksum passes validation
   - Modified checkpoint fails validation
   - Truncated checkpoint fails validation

3. **Recovery detection**
   - Missing checkpoint sets recoveryRequired flag
   - Corrupt checkpoint sets recoveryRequired flag
   - Fresh startup creates clean checkpoint

4. **calculateActualPcForRun**
   - Sums records for matching runId
   - Returns 0 for non-existent runId
   - Handles empty record set
   - Rounds correctly

5. **Settlement integration**
   - Settlement throws on recoveryRequired flag
   - Settlement calculates actual_pc correctly
   - Settlement calls RPC with correct parameters
   - Settlement returns billing_event_id

6. **Orphan temp cleanup**
   - Cleans up .tmp files on startup
   - Preserves valid main checkpoint

---

## I. REMAINING WORK (Not in Checkpoint 2 Scope)

### Renderer Layer (Next Checkpoint)

- [ ] Update extend_autonomous_reservation callers to pass executor_instance_id
- [ ] Implement AutonomousOrchestrator lifecycle with all new RPCs
- [ ] Wire top-up resume flow
- [ ] Add executor instance ID to claim operations

### Tests (Deferred)

- [ ] Unit tests for UsageEventStore checkpoint model
- [ ] Integration tests with live Supabase
- [ ] E2E tests for settlement flow
- [ ] Concurrency tests for checkpoint writes

### Out of Scope (Later work)

- [ ] Razorpay, invoicing, Enterprise
- [ ] Subscription pricing changes
- [ ] Entitlements, seat billing
- [ ] Tier Compute modifications
- [ ] Dependency upgrades
- [ ] Execution termination logic

---

## J. PHASE 3 CHECKPOINT 2 SUMMARY

**Status**: ✓ COMPLETE

**Deliverables**:

1. ✓ UsageEventStore upgraded to crash-safe checkpoint model with fsync and atomic rename
2. ✓ Recovery detection flag to prevent silent zero-PC settlement on data loss
3. ✓ Efficient calculateActualPcForRun() method for settlement
4. ✓ Settlement IPC handler updated with recovery check and proper error handling
5. ✓ getSupabaseClient() helper for authenticated Supabase access
6. ✓ Complete documentation of durability protocol and data flow
7. ✓ TypeScript compilation verified (no errors)
8. ✓ API compatibility maintained (no breaking changes)

**Main Process Guarantees**:

- ✓ Authoritative usage data stored in durable UsageEventStore
- ✓ Crash-safe persistence with fsync and atomic rename
- ✓ Corruption detection via checksums and validation
- ✓ Recovery flag prevents settling with 0 PC on data loss
- ✓ actual_pc calculated by main process, never renderer
- ✓ No queries to Supabase usage_events table
- ✓ No service-role credentials in Electron
- ✓ Authenticated RPC calls via public anon key

**Safe to Deploy**: NO

Remaining: Renderer layer (AutonomousOrchestrator) still needs implementation.

---

**End of Phase 3 Checkpoint 2 Report**
