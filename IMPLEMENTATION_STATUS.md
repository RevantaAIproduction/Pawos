# Atomic Authorization Implementation Status

## CODING PHASE: Priority 1 Complete ✅

The atomic authorization RPC and AutonomousOrchestrator integration are implemented.

### What Was Implemented

#### 1. SQL Migration ✅

**File:** `supabase/migrations/20260906000000_atomic_autonomous_model_request_authorization.sql`

**Content:**
- New RPC: `authorize_autonomous_model_request(p_run_id, p_request_id, p_required_pc, p_executor_instance_id)`
- Validates run ownership + state + executor claim
- Row-level locking: `FOR UPDATE` on affected run and wallet only
- Idempotency check: `(run_id, request_id)` unique constraint
- Atomic extend: wallet mutation only if funds available
- Zero mutations on failure
- Records event in `autonomous_reservation_requests`
- Index added for fast lookups

#### 2. TypeScript Changes ✅

**File:** `src/renderer/organization/AutonomousOrchestrator.ts`

**Changes:**
- Removed: `getCurrentRunState()` (fresh read pattern)
- Added: `authorizeModelRequest(requiredPc, executorInstanceId)` 
  - Calls new RPC atomically
  - Generates unique `request_id` per model request
  - Throws if RPC returns `success: false`
- Updated: `streamResponse()` 
  - Awaits authorization before Gemini call
  - Only calls `baseProvider.streamResponse()` if auth succeeds
  - Clear logging at each step

#### 3. Imports ✅

- Added: `import type { ReasoningProviderRequest }` for type safety

#### 4. Build Status

- **TypeScript compilation:** ✅ No errors
- **Build:** Running (currently in progress)
- **Tests:** Queued (will report when complete)

---

## Verification Required (Before Days 3-4 Testing)

### Must Verify Before Runtime Testing

#### 1. Migration applies cleanly ⏳

**What to check:**
```bash
supabase migration list  # Does 20260906000000 show as applied?
supabase rpc list       # Is authorize_autonomous_model_request visible?
```

**Success criteria:**
- Migration applies without error
- RPC is executable
- Index created

#### 2. RPC executes end-to-end ⏳

**Integration test (manual or automated):**
```
1. Create test run in autonomous_task_runs
2. Set execution_claimed_by, executor_instance_id, status=running
3. Call authorize_autonomous_model_request via Supabase client
4. Verify response: success=true, reserved_pc increased
5. Verify wallet: balance_pc decreased, balance_reserved increased
6. Call again with same request_id: verify idempotency (no second deduction)
```

**Success criteria:**
- RPC returns success
- Wallet mutations correct
- Idempotency works

#### 3. Insufficient funds scenario ⏳

**Test:**
```
1. Create run with wallet balance = 30 PC
2. Call RPC with required_pc = 50
3. Verify: success=false, error_message present, wallet unchanged
```

**Success criteria:**
- RPC returns success=false with clear reason
- Zero wallet mutations
- Error logged

#### 4. Concurrency safety (Real DB tests) ❌ **NOT IMPLEMENTED YET**

**Required:** Real database concurrency tests (not mocked Promises)

These must verify:

**Scenario 1: Two different requests against same run**
```
Request A: authorize(50 PC) → succeeds, reserved_pc = 50
Request B (concurrent): authorize(50 PC) → succeeds, reserved_pc = 100
Verify: No double-reserve, wallet deducted 100 total, both authorization records exist
```

**Scenario 2: Same request ID concurrent attempts**
```
Two calls with identical (run_id, request_id) at same time
Verify: Only one wallet mutation, both RPC calls return same result
```

**Scenario 3: Insufficient funds during concurrent attempts**
```
Wallet: 60 PC available
Request A: authorize(40 PC)
Request B (concurrent): authorize(40 PC)
Verify: One succeeds, other fails with "insufficient balance"
   AND wallet shows exactly 20 PC remaining (not negative/doubled)
```

**Scenario 4: Two runs, same wallet**
```
Run A: authorize(50 PC) on wallet X
Run B (concurrent): authorize(50 PC) on wallet X
Verify: Both succeed, wallet X shows 100 reserved
```

**Scenario 5: Two runs, different wallets**
```
Run A: authorize(50 PC) on wallet X
Run B (concurrent): authorize(50 PC) on wallet Y
Verify: No interference, both independent, both succeed
```

---

## What's NOT Done (Explicitly Deferred)

### 1. ❌ Concurrency Tests Not Implemented

**Reason:** Requires real database concurrency (staging or local Supabase)

**What's needed:**
- Real concurrent database transactions (not mocked)
- Test framework that can run simultaneous queries
- Verification of actual DB state post-test

**Why it matters:**
- Proves idempotency at DB level works
- Proves row-level locks prevent corruption
- Proves two requests can't over-spend wallet

### 2. ❌ Executor Instance ID Not Threaded

**Current code:**
```typescript
await authorizeModelRequest(requiredPcPerRequest, null);  // TODO
```

**Issue:** executor_instance_id should come from execution claim

**Fix needed:**
- Trace where executor_instance_id is available in HeadlessTurnRunner
- Pass it through to createAuthorizedProvider
- Use in authorizeModelRequest call

### 3. ❌ Model ID Not Resolved Properly

**Current code:**
```typescript
const model = baseProvider.id === 'gemini' ? 'gemini-flash-latest' : baseProvider.id;
```

**Issue:** Should get actual model from aiRouter config

**Fix needed:**
- Access actual model ID from aiRouter or config
- Use for authorization calculation

---

## Next Steps (Priority Order)

### Phase A: Verify Implementation Works ⏳ IN PROGRESS

1. [ ] Build completes: `npm run build` → exit code 0
2. [ ] Tests pass: `npm test -- --run` → exit code 0  
3. [ ] Apply migration to staging Supabase
4. [ ] Run manual RPC test: call via Supabase client directly
5. [ ] Verify idempotency: call twice with same request_id

### Phase B: Implement Concurrency Tests ❌ NOT STARTED

1. [ ] Set up staging database
2. [ ] Write 5 concurrent test scenarios
3. [ ] Run tests: verify DB state after each

### Phase C: Wire Executor Instance ID ❌ NOT STARTED

1. [ ] Find where executor_instance_id available
2. [ ] Thread through to authorizeModelRequest
3. [ ] Update RPC call in streamResponse

### Phase D: Wire Real Model ID ❌ NOT STARTED

1. [ ] Access actual model from aiRouter config
2. [ ] Use in calculateMaxRequestCost
3. [ ] Verify in test/build

---

## Build & Test Status

**Build:** Running (npm run build)  
**Tests:** Queued (npm test -- --run)

Will report results when they complete.

---

## Critical Claims Made

### ✅ Proven in Code

1. **Atomic authorization at RPC boundary** — Single SQL transaction, `FOR UPDATE` locks
2. **Row-level locking** — `FOR UPDATE` on specific run/wallet rows only
3. **Idempotency via unique constraint** — `(run_id, request_id)` unique
4. **Zero mutations on failure** — Code path reviewed
5. **Explicit success/failure return** — RPC returns `success BOOLEAN` + `error_message`
6. **Gemini only called if RPC succeeds** — Code flow: await RPC → if success only then call provider

### ⏳ Unverified (Requires Testing)

1. **Migration actually applies** — Need to run against real Supabase
2. **RPC executes correctly** — Need end-to-end test
3. **Concurrency safety** — Need real DB concurrent tests
4. **Idempotency works** — Need test with same request_id twice
5. **Insufficient funds fail safely** — Need test with depleted wallet

### ❌ Not Yet Addressed

1. Executor instance ID threading
2. Real model ID resolution

---

## NOT Ready For

- ❌ Electron/Desktop runtime testing
- ❌ Days 3-4 runtime verification
- ❌ Production deployment

## Ready For

- ✅ Code review
- ✅ Build verification
- ✅ Staging database testing
- ✅ Concurrency test implementation
