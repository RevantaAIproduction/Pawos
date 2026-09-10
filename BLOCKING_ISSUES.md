# BLOCKING ISSUES - Coding Phase NOT Complete

Three architectural gaps prevent coding completion.

---

## BLOCKER 1: No Initial Execution Claim

**Current State:**
- `orchestrateAutonomousRun()` transitions run to 'running' (line 649)
- Calls `turnRunner.run()` immediately after (line 656)
- NO execution claim happens
- NO executor_instance_id is generated
- RPC expects executor_instance_id but none is available

**What's Missing:**
```
Initial execution claim mechanism
Current code only has: resume_and_claim_autonomous_run() 
(used ONLY for resume-after-topup, not initial execution)
```

**Architectural Boundary:**
```
No RPC exists to:
  - Claim execution for initial run
  - Generate executor_instance_id for initial run
  - Return executor_instance_id to orchestrator
```

**Workaround in Place:**
- Code generates `crypto.randomUUID()` locally (line 261-263)
- This defeats executor validation (caller manufactures the identity being validated)

**Required Fix:**
Option A: Create `claim_autonomous_execution()` RPC
  - Call from orchestrateAutonomousRun() before turnRunner.run()
  - Returns executor_instance_id
  - Pass to autorizeModelRequest()
  
Option B: Extend `resume_and_claim_autonomous_run()` for initial execution
  - Modify RPC to work for both initial and resumed execution
  - Call from orchestrateAutonomousRun()
  
Option C: Accept limitation
  - Document that executor validation is not enforced initially
  - Only validated on resume-after-topup
  - Change RPC to make executor_instance_id optional for initial execution

---

## BLOCKER 2: Hardcoded Model ID for Authorization

**Current State:**
```typescript
const model = baseProvider.id === 'gemini' ? 'gemini-flash-latest' : baseProvider.id;
```

**Problem:**
- Authorization calculation uses 'gemini-flash-latest'
- Actual model from aiRouter might be different
- Model pricing directly affects required_pc
- Authorization model ≠ Execution model = billing mismatch

**What's Missing:**
- No trace of aiRouter's actual model selection
- No guarantee 'gemini-flash-latest' is the canonical model
- No way to verify they're using the same model

**Architectural Boundary:**
```
Cannot find:
  - Where aiRouter resolves the model
  - What the actual model identity is
  - Whether it's hardcoded or configurable
```

**Required Fix:**
Find and use same model for:
  1. Authorization pricing calculation
  2. Actual Gemini API request
  
Add test: if auth_model ≠ execution_model, fail test

---

## BLOCKER 3: Token Estimation Heuristic Not Investigated

**Current State:**
```typescript
const estimatedInputTokens = Math.ceil(totalInputChars / 4);
```

**Problem:**
- Heuristic estimate (chars / 4)
- No investigation whether exact preflight token count is available
- Documentation says "conservative" but doesn't say "might be insufficient"

**What's Not Done:**
- No research into Gemini token counter API
- No investigation of latency/cost implications
- No decision whether preflight counting is feasible

**Required Fix:**

Option A: Implement exact preflight token counting
  1. Research Gemini API for token counter
  2. Call before authorization
  3. Use actual token count instead of heuristic
  4. Document latency/cost implications
  5. Update required_pc calculation

Option B: Accept and document limitation
  1. Explicitly state: "Input estimation may be insufficient"
  2. Document: "Authorization ≠ guaranteed sufficient funds"
  3. Preserve this as a known accounting risk

---

## Actual SQL Issues Found

After reviewing migration `20260906000000_atomic_autonomous_model_request_authorization.sql`:

### ISSUE: Idempotency Record Insertion vs. Actual Extension

**Problem:**
- Line 188-193: Failure records inserted into autonomous_reservation_requests
- Line 230-234: Success records inserted
- But the idempotency lookup happens BEFORE checking balance (line 146-149)
- If a prior authorization failed, next call returns cached failure (correct)
- But if it succeeded, ANY subsequent call returns same result (correct for true duplicate)

**Severity:** LOW - idempotency is working correctly, just wanted to verify

### Issue: Wallet State After Failure

**Problem:** None found
- Line 186-197: Insufficient funds path doesn't mutate wallet (correct)
- Line 204-217: Wallet mutations only after check passes (correct)

### ISSUE: Transaction Ordering

**Problem:** None found
- Run locked first (line 74-76)
- Then wallet locked (line 120-131)
- Then idempotency checked (line 146-149)
- Prevents deadlock between runs on same wallet

---

## Summary of Architectural Gaps

| Issue | Type | Impact | Blocker |
|-------|------|--------|---------|
| No initial execution claim | Architectural | Cannot get executor_instance_id | **BLOCKS** |
| Hardcoded model ID | Implementation | Authorization pricing may not match execution | **BLOCKS** |
| Token estimation not researched | Investigation | No proof whether better option exists | **BLOCKS** |

---

## Verdict

**Coding is NOT complete.**

Three architectural decisions must be made and implemented:

1. **Executor claim wiring** - Pick A/B/C, implement, test
2. **Model ID resolution** - Find authoritative source, verify consistency, test
3. **Token estimation** - Investigate Option A, or accept Option B with explicit documentation

The atomic RPC itself is correct, but it cannot be used without resolving these three gaps.
