# PHASE 2: BLOCKERS STATUS — PHASE 2B COMPLETE, 2C/2D SCOPED

**Date:** 2026-09-07  
**Overall Status:** Phase 2A ✅ Complete | Phase 2B ✅ Complete | Phase 2C 🔄 Scoped | Phase 2D 🔄 Scoped

---

## PHASE 2A: ✅ SETTLEMENT PATH — COMPLETE

- Settlement bug fixed (normalized compute → Work PC conversion)
- 15 unit tests passing
- Conservation invariant verified
- TypeScript clean

**Artifact:** [PHASE2A_VERIFICATION_COMPLETE.md](PHASE2A_VERIFICATION_COMPLETE.md)

---

## PHASE 2B: ✅ MODEL IDENTITY — COMPLETE

- Hardcoded fallback removed from AutonomousOrchestrator
- ReasoningProvider interface exposes model property
- All provider implementations (Gemini, OpenAI, Anthropic, Ollama, etc.) expose model
- 20 unit tests passing (all paw-flash/swift/core mappings verified)
- TypeScript clean
- No hardcoded 'gemini-flash-latest' fallback (throws error if model missing)

**Artifact:** [PHASE2B_MODEL_IDENTITY_COMPLETE.md](PHASE2B_MODEL_IDENTITY_COMPLETE.md)

---

## PHASE 2C: 🔄 SERVER-AUTHORITATIVE EXECUTOR CLAIM — SCOPED

### Current State (BEFORE Fix)

**Problem:** Local `crypto.randomUUID()` is authority for executor instance ID

```typescript
// src/renderer/organization/AutonomousOrchestrator.ts:278
const actualExecutorId = executorInstanceId ?? crypto.randomUUID();
```

**Flow:**
1. Run starts with local executor UUID
2. Passed to `authorize_autonomous_model_request` RPC
3. RPC validates it matches claimed executor in database
4. Problem: If executor was never claimed server-side, RPC fails silently

**Why this matters:**
- Settlement depends on `execution_executor_instance_id` being authoritative
- Without server claim, no way to enforce "one executor per run"
- Double-execution possible if two clients get different UUIDs

### Required Implementation

**Step 1: Create `claim_autonomous_executor_for_run` RPC**

```sql
CREATE OR REPLACE FUNCTION claim_autonomous_executor_for_run(
  p_run_id UUID,
  p_claim_request_id TEXT
)
RETURNS TABLE (
  run_id UUID,
  execution_executor_instance_id UUID,
  execution_claim_request_id TEXT,
  status TEXT,
  error_message TEXT
)
```

**Behavior:**
- Generates server-side UUID: `gen_random_uuid()`
- Stores in `autonomous_task_runs.execution_executor_instance_id`
- Stores claim request ID for idempotency
- Sets `execution_claimed_by = auth.uid()`
- Sets `execution_claimed_at = NOW()`
- Returns the server-generated ID to client

**Idempotency:** Same `p_claim_request_id` returns existing claim (not new UUID)

**Step 2: Call in HeadlessTurnRunner BEFORE authorization**

```typescript
// src/renderer/organization/AutonomousOrchestrator.ts:415-425 (before run() calls createAuthorizedProvider)
async run(prompt: string, opts: { autonomousRunId?: string; autonomousOrganizationId?: string }): Promise<HeadlessTurnResult> {
  if (opts.autonomousRunId) {
    // NEW: Claim executor from server BEFORE any authorization
    const claimRequestId = crypto.randomUUID(); // NEW
    const claimResult = await supabase.rpc('claim_autonomous_executor_for_run', {
      p_run_id: opts.autonomousRunId,
      p_claim_request_id: claimRequestId
    });
    
    if (claimResult.error) throw new Error(`Executor claim failed: ${claimResult.error.message}`);
    const executorInstanceId = claimResult.data[0].execution_executor_instance_id; // Server-assigned
    
    // Thread executor ID through to createAuthorizedProvider
    const authorizedProvider = this.createAuthorizedProvider(
      baseProvider,
      opts.autonomousRunId,
      opts.autonomousOrganizationId ?? null,
      executorInstanceId  // NEW parameter
    );
  }
}
```

**Step 3: Use server-assigned ID in authorization**

```typescript
// src/renderer/organization/AutonomousOrchestrator.ts:267-290 (in createAuthorizedProvider)
const authorizeModelRequest = async (requiredPc: number, executorInstanceId: string | null): Promise<void> => {
  // REMOVED: const actualExecutorId = executorInstanceId ?? crypto.randomUUID();
  
  // NEW: Use server-assigned ID, never fallback
  if (!executorInstanceId) {
    throw new Error(
      'Executor instance ID not provided. ' +
      'Call claim_autonomous_executor_for_run() before authorization.'
    );
  }
  
  await supabase.rpc('authorize_autonomous_model_request', {
    p_run_id: runId,
    p_request_id: requestId,
    p_required_pc: requiredPc,
    p_executor_instance_id: executorInstanceId  // Server-generated
  });
};
```

### Tests Needed (Phase 2C)

1. ✅ Server generates distinct UUID for each run
2. ✅ Same claim request ID returns same executor ID (idempotency)
3. ✅ Two runs get different executor IDs
4. ✅ Authorization fails if executor ID doesn't match claim
5. ✅ No local `crypto.randomUUID()` in authorization path
6. ✅ RPC failure throws error (doesn't silently fallback)

### Database Changes (Phase 2C)

**New file:** `supabase/migrations/20260907000000_server_authoritative_executor_claim.sql`

- `CREATE FUNCTION claim_autonomous_executor_for_run(...)`
- Grant execute to authenticated
- No table changes (columns already exist from Phase 3)

---

## PHASE 2D: 🔄 EXACT GEMINI TOKEN PREFLIGHT — SCOPED

### Current State (BEFORE Fix)

**Problem:** Authorization uses heuristic `chars/4` for token estimation

```typescript
// src/renderer/organization/AutonomousOrchestrator.ts:222
const estimatedInputTokens = Math.ceil(totalInputChars / 4);
```

**Issue:**
- Heuristic may be off by 10-50%
- Can lead to insufficient reservation
- Or over-reservation and wasted credits

**Requirement:**
- Use Gemini `countTokens` API (exact count)
- Or document limitation if API can't be used
- Do not use chars/4 without verification

### Investigation Needed

**1. Does Gemini have `countTokens` API?**

Check: https://ai.google.dev/api/rest/google.ai.generativelanguage.v1beta/projects/locations/endpoints/countTokens

Expected: Yes, but verify:
- Endpoint: `models/{model}:countTokens`
- Input: Request body same structure as `generateContent`
- Output: `{ totalTokens: number }`

**2. Can we call it before authorization?**

```typescript
async function countTokens(model: string, request: ReasoningProviderRequest): Promise<number> {
  const url = `${baseUrl}/models/${model}:countTokens?key=${apiKey}`;
  const res = await fetch(url, {
    method: 'POST',
    body: JSON.stringify({
      contents: toGeminiContents(request),
      // Same structure as generateContent
    })
  });
  const data = await res.json();
  return data.totalTokens;
}
```

**3. Call sequence:**

```typescript
async calculateMaxRequestCost(request, model) {
  // NEW: Get exact token count from Gemini API
  let inputTokens;
  try {
    inputTokens = await countTokens(model, request); // EXACT
  } catch (err) {
    // If countTokens fails, what's the fallback?
    // Options:
    // A) Throw error (fail-safe: don't authorize if token count unknown)
    // B) Use heuristic with wide safety margin (safer than tight margin)
    // C) Use heuristic + log warning (for debugging)
    throw err; // Option A: fail-safe
  }
  
  // Rest of calculation uses exact inputTokens
  const inputUsd = (inputTokens * pricing.inputPerMillionUsd) / 1_000_000;
}
```

### Tests Needed (Phase 2D)

1. ✅ countTokens API call succeeds for valid requests
2. ✅ countTokens matches Gemini's actual usage report
3. ✅ Authorization uses countTokens result (not chars/4)
4. ✅ No chars/4 heuristic in authorization path
5. ✅ Token count mismatch fails authorization (doesn't silently use heuristic)
6. ✅ Multiple requests with same content get exact same token count

### Database Changes (Phase 2D)

**None.** This is purely application-layer token counting.

---

## VERIFICATION STATUS

| Blocker | Code | Tests | DB/RPC | Status |
|---------|------|-------|--------|--------|
| Phase 2A: Settlement | ✅ Fixed | ✅ 15 tests | ✅ No changes | ✅ COMPLETE |
| Phase 2B: Model ID | ✅ Fixed | ✅ 20 tests | ✅ No changes | ✅ COMPLETE |
| Phase 2C: Executor Claim | 🔄 Scoped | 🔄 6 tests | 🔄 1 RPC | 🔄 READY |
| Phase 2D: Token Preflight | 🔄 Scoped | 🔄 6 tests | ✅ No changes | 🔄 READY |

---

## NEXT STEPS

**Immediate (after context restoration):**

1. Implement Phase 2C:
   - Create `claim_autonomous_executor_for_run` RPC
   - Thread executor ID through HeadlessTurnRunner
   - Remove local `crypto.randomUUID()` from authorization path
   - Add 6 unit tests
   - Verify TypeScript clean

2. Implement Phase 2D:
   - Investigate Gemini `countTokens` API
   - Implement exact token preflight
   - Replace chars/4 heuristic
   - Add 6 unit tests
   - Verify TypeScript clean

3. Full regression verification:
   - Run complete unit test suite
   - Build renderer/main
   - Test in Electron with live autonomous run
   - Verify settlement calculates correct Work PC

4. Final status:
   - Generate PHASE2_FINAL_STATUS.md
   - All three blockers resolved
   - Ready for staging environment test

---

## STOP CONDITIONS (Still Valid)

If any of these remain unresolved, STOP and report:

- [ ] Actual executable model cannot be determined authoritatively
- [ ] Pricing model differs from execution model
- [ ] Executor identity is not server authoritative
- [ ] Token preflight cannot reproduce effective generateContent request
- [ ] Token preflight cannot safely determine authorization
- [ ] Provider actual USD cost cannot be reconstructed reliably
- [ ] Settlement receives normalized compute instead of Work PC
- [ ] Reservation and settlement denominations differ
- [ ] Concurrent authorization/claim can double-spend or double-execute
- [ ] Immutable billing history cannot reconstruct the commercial charge

---

**Completion Target:** All three blockers resolved by 2026-09-08

**Verification Approach:** Code trace + unit tests + TypeScript clean + staging validation
