# Critical Correctness Gaps Found

## CRITICAL ISSUE 1: waiting_for_permission State

**Location:** `supabase/migrations/20260906000000_atomic_autonomous_model_request_authorization.sql` line 97

**Problem:**
```sql
IF v_run.status NOT IN ('running', 'waiting_for_permission') THEN
```

**Why it's wrong:**
- A run in 'waiting_for_permission' state means it's waiting for user approval on a destructive action
- Authorizing new Gemini requests while waiting for permission violates the permission boundary
- Model requests should ONLY be authorized when status = 'running'

**Fix:** Change to:
```sql
IF v_run.status <> 'running' THEN
```

---

## CRITICAL ISSUE 2: executor_instance_id Validation with NULL

**Location:** `supabase/migrations/20260906000000_atomic_autonomous_model_request_authorization.sql` line 109

**Problem:**
```sql
IF v_run.execution_executor_instance_id <> p_executor_instance_id THEN
```

**Why it's wrong:**
- Current code in AutonomousOrchestrator passes `null` for executor_instance_id
- When `p_executor_instance_id` is NULL, comparison `UUID <> NULL` is always TRUE in SQL
- This REJECTS ALL REQUESTS even when the run has a valid executor claim
- The RPC is supposed to validate the executor, but it's actually blocking ALL authorization

**Current code calling this:**
```typescript
await authorizeModelRequest(requiredPcPerRequest, null);  // TODO: pass actual executor_instance_id
```

**Fix required:**
1. Find where `resume_and_claim_autonomous_run()` is called (if anywhere)
2. Capture the `execution_executor_instance_id` returned
3. Pass it through: orchestrateAutonomousRun → HeadlessTurnRunner → createAuthorizedProvider → authorizeModelRequest
4. In RPC, handle NULL properly (should reject):
   ```sql
   IF p_executor_instance_id IS NULL THEN
     RETURN QUERY SELECT FALSE, NULL::INTEGER, NULL::INTEGER, 'Executor instance ID required'::TEXT;
     RETURN;
   END IF;
   IF v_run.execution_executor_instance_id <> p_executor_instance_id THEN
     RETURN QUERY SELECT FALSE, NULL::INTEGER, NULL::INTEGER, 'Executor instance ID mismatch'::TEXT;
     RETURN;
   END IF;
   ```

---

## CRITICAL ISSUE 3: Settled Run Can Be Re-authorized

**Location:** `supabase/migrations/20260906000000_atomic_autonomous_model_request_authorization.sql`

**Problem:**
- RPC does NOT check if run is already settled
- A run that's already settled should NOT be able to authorize new model requests
- This violates the settlement finality

**Fix:** Add check after executor validation:
```sql
IF v_run.settled_at IS NOT NULL THEN
  RETURN QUERY SELECT FALSE, NULL::INTEGER, NULL::INTEGER, 'Run is already settled'::TEXT;
  RETURN;
END IF;
```

---

## CRITICAL ISSUE 4: Hardcoded Model ID

**Location:** `src/renderer/organization/AutonomousOrchestrator.ts` line 290

**Problem:**
```typescript
const model = baseProvider.id === 'gemini' ? 'gemini-flash-latest' : baseProvider.id;  // TODO: get actual model from config
```

**Why it's wrong:**
- Authorization calculation uses hardcoded 'gemini-flash-latest'
- But the actual provider might use a different model
- Authorization prices one model while execution uses another = billing mismatch

**Fix:** Must resolve actual model before authorization

---

## CRITICAL ISSUE 5: Input Token Estimation Claimed as "Heuristic" but Not Documented

**Location:** `src/renderer/organization/AutonomousOrchestrator.ts` lines 204-218

**Problem:**
- Code uses `chars / 4` as input token estimate
- Calls it "conservative" and "estimates"
- But doesn't document that this could be WRONG
- Doesn't document the limitation that authorization might be INSUFFICIENT

**What's claimed:** "Provable max cost"
**What's actually true:** "Conservative estimate that might be too low"

**Fix:** Update all documentation to say:
```
INPUT TOKEN ESTIMATE (NOT EXACT):
- Uses character count / 4 as heuristic average
- May underestimate actual input tokens
- Therefore authorization amount may be insufficient for edge cases
- This is a KNOWN LIMITATION, not a proven bound
```

---

## CRITICAL ISSUE 6: Invariant Wording

**What's currently claimed:** "NO GEMINI REQUEST WITHOUT VALID RESERVATION"

**What's actually true:**
```
Gemini is not invoked unless:
1. The atomic authorization RPC executes
2. The RPC validates ownership, state, executor
3. The RPC checks wallet balance
4. The RPC successfully authorizes the requested amount

The "requested amount" is calculated as:
  (estimated_input_tokens + 8000_output_tokens) * price + 10% margin

Since input_tokens is a heuristic estimate (not proven), the actual
billable cost might exceed the authorized amount in edge cases.

This is still safer than the previous read-check-extend pattern
(which was vulnerable to races), but it is NOT a mathematical guarantee.
```

---

## ISSUE 7: Model ID Not Threaded

**Location:** `src/renderer/organization/AutonomousOrchestrator.ts`

**Problem:**
- `calculateMaxRequestCost()` receives model as parameter
- But calling code passes hardcoded model (or guessed model)
- Should use actual model from provider/aiRouter

**Trace needed:**
```
aiRouter.getReasoningProvider() 
  → where is the model ID?
  → can we get actual model before authorization?
```

---

## What Needs to Be Done

### FIX 1: RPC State Validation (URGENT)

Change line 97 of migration from:
```sql
IF v_run.status NOT IN ('running', 'waiting_for_permission') THEN
```

To:
```sql
IF v_run.status <> 'running' THEN
```

Apply: `ALTER FUNCTION authorize_autonomous_model_request(...)` version

### FIX 2: RPC Executor Validation (URGENT)

Add checks for NULL and settled:
- If executor_instance_id is NULL → reject
- If executor_instance_id doesn't match claim → reject  
- If run is settled → reject

### FIX 3: Thread Executor Instance ID (URGENT)

Find:
1. Where `resume_and_claim_autonomous_run()` is called
2. Capture the `execution_executor_instance_id`
3. Thread through: orchestrateAutonomousRun → HeadlessTurnRunner → createAuthorizedProvider → authorizeModelRequest()
4. Pass to RPC

### FIX 4: Resolve Actual Model ID (URGENT)

Find actual model from aiRouter, use for authorization calculation

### FIX 5: Update Documentation (URGENT)

Correct all wording:
- NOT "provable" → "authorized"
- NOT "upper bound" → "conservative estimate"
- NOT "guarantee" → "validation checkpoint"

---

## Summary

**THREE critical bugs:**
1. RPC accepts waiting_for_permission (violates permission boundary)
2. RPC rejects all requests because executor_instance_id is always NULL
3. RPC doesn't check if run is settled

**TWO critical design issues:**
1. Model ID hardcoded (causes authorization/execution mismatch)
2. Input token calculation not documented as limitation

**Result:** Current implementation does NOT work. The authorization RPC will reject ALL requests due to NULL executor_instance_id validation.
