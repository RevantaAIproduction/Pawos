# TEST PLAN AUDIT REPORT V2 (CRITICAL CORRECTIONS)

**Date:** 2026-09-09  
**Version:** 2 (Additional Critical Corrections Applied)  
**Scope:** Verification of COMPREHENSIVE_TEST_PLAN_REVISED.md against actual current implementation and product launch scope  
**Result:** Critical scope violations found — corrections required before test execution

---

## CRITICAL CORRECTIONS (ADDITIONAL TO V1 AUDIT)

### 1. MEETINGS INCORRECTLY CLASSIFIED AS P0 (SCOPE VIOLATION)

**Finding:**
- TEST-MEET-001, TEST-MEET-002, TEST-MEET-003 incorrectly classified as P0 (mandatory for launch)
- Meetings were explicitly deferred to V2 per project memory (no renderer/UI consumer implemented)
- Test plan confuses backend billing implementation with launch-ready product surface

**Actual Implementation Status:**
- Backend: meetingHandler.ts, MeetingService.ts — IPC handlers exist, billing path exists
- Renderer: UI consumer for meetings NOT implemented (deferred to V2)
- Product Launch Scope: Meetings NOT part of current launch

**Correction:**
1. Move TEST-MEET-001, TEST-MEET-002, TEST-MEET-003 from Phase 7 (P0) to Part D (V2/Deferred)
2. Recalculate P0 count: 32 → 29 tests
3. Renumber all subsequent tests (former tests 30+ become 27+)
4. Add note: "Meeting backend implementation verified; renderer UI consumer deferred to V2"
5. Remove meeting tests from execution phases 1-8 entirely

**Evidence/Source:**
- Project memory: communication_runtime_frozen.md states Meetings deferred to V2
- src/renderer shows no meeting UI consumer
- Decision: Meetings not in current launch scope

**Priority Impact:** CRITICAL — removes 3 tests from P0, changes total test count to 53

---

### 2. TEST-BILL-003: MEETING BILLING PATH CONFUSION (IMPLEMENTATION MISMATCH)

**Finding:**
- TEST-BILL-003 incorrectly assumes meeting summarization uses autonomous countTokens() preflight
- Confuses autonomous Work PC authorization with meeting Tier Compute billing
- Does not trace actual meeting billing runtime path

**Actual Implementation:**
Current meeting billing path:
```
meetingHandler.ts:192
  → meetingService.generateSummary()
  → ConversationRuntime
  → recordUsageEvent(providerUsageMetadata)
  → UsageMeteringEngine
  → CreditStore.consume(normalizedCompute)
```

No autonomous countTokens() preflight in meeting path. Billing is direct creditStore.consume() call based on actual usage.

**Correction:**
1. Remove expected result: "Exact token count from Gemini countTokens() used"
2. Remove evidence requirement: "DevTools Network tab shows Gemini countTokens API call"
3. Replace with actual path evidence:
   - Supabase billing event created with event_type = 'meeting_summarization'
   - CreditStore usage recorded via meetingHandler
   - Tier Compute balance decremented
4. Note: Meeting billing does NOT use autonomous countTokens() preflight
5. Note: This is Tier Compute (tokens), NOT Work PC

**Evidence/Source:**
- src/main/ipc/handlers/meetingHandler.ts:279-284

**Priority Impact:** MEDIUM — test correctness

---

### 3. P0/P1 LAUNCH GATE CRITERIA OVERLY PERMISSIVE (RISK)

**Finding:**
- Test plan states: "P1 tests: 90% pass rate acceptable"
- Single blanket rule hides critical failures in billing, security, data isolation

**Actual Launch Requirements:**
Different test categories have different pass thresholds:

**MUST BE 100%:**
- Authentication & session management (Tests 1-5)
- Billing & accounting (Tests 6-9)
- Autonomous authorization/reservation/settlement (Tests 16-23)
- RLS/data isolation (Tests 41-43)
- Critical connector authorization (Tests 10-15)
- Advertised launch connector write-back (Jira/Linear comment + Done)

**May Have Documented Exceptions (90% OK):**
- Performance/resilience (Tests 48-49)
- Advanced features already verified to work (P1 regression tests)
- Post-launch improvements

**Correction:**
1. Replace blanket "90% P1 pass rate" with category-specific thresholds
2. Define P0: tests 1-29 (auth + billing + autonomous + connectors) = 100% must pass
3. Define P1 by category:
   - P1 Critical (security/billing subcategories): 100%
   - P1 Advanced (performance/optional): 90% acceptable
4. Add decision rule: "Single failure in security, billing, data-integrity, or autonomous-accounting cannot be hidden in aggregate scoring"

**Priority Impact:** HIGH — launch gate integrity

---

### 4. TEST DEPENDENCIES OVERSTATED (EXECUTION CLARITY)

**Finding:**
- Test plan claims every test depends on all preceding tests
- Actually: many tests have independent prerequisites
- Leads to false understanding of execution constraints

**Actual Dependencies:**
**HARD DEPENDENCIES (must complete before dependent tests):**
- TEST-AUTH-001 → ALL other tests (creates user)
- TEST-BILL-004 → Tests 16-23 (establishes Work PC balance)
- TEST-CONN-001 → Tests 24, 28 (GitHub connected)
- TEST-CONN-002 → Tests 25 (Jira connected)
- TEST-CONN-003 → Tests 26 (Linear connected)
- Tests 16-20 → Tests 21-23 (architecture verified)

**SOFT/RECOMMENDED ORDER (but no hard dependency):**
- TEST-BILL-001 before TEST-BILL-002 (established baseline)
- TEST-CONN-004 (Slack) before later Slack tests (if any)
- Phases sequence for logical grouping, but not strict dependencies

**Correction:**
1. Distinguish hard dependencies explicitly
2. Note soft/recommended ordering
3. Clarify: Jira/Linear/GitHub connector tests are independent of each other (only need their respective connectors)
4. Update execution order to separate "must run sequentially" from "recommended grouping"

**Priority Impact:** MEDIUM — execution clarity

---

### 5. TEST TYPE CLASSIFICATION INACCURATE (MISLEADING LABELS)

**Finding:**
- Tests labeled "Automated" actually require manual DevTools, screenshots, log review
- Confuses readers about what "automated" means
- Masks tests that truly require hands-on testing

**Current Mislabeling Examples:**
- TEST-AUTO-002 (Executor Claiming): labeled "Automated" but requires manual console log inspection
- TEST-AUTO-004 (Token Preflight): labeled "Automated" but requires DevTools Network tab observation
- TEST-SEC-P1-001A (RLS Source): labeled "Static Code Review" but is actually source verification
- Multiple tests: labeled "Automated" but require Supabase query inspection

**Correction:**
Use accurate categories:
- **Automated unit** - true unit tests, no manual observation
- **Automated integration** - true integration tests, code-only verification
- **Static/source verification** - code inspection, git diffs, no execution
- **Manual Electron/runtime** - requires app interaction, screenshots, visual verification
- **Staging E2E** - real Supabase, real OAuth, manual flow
- **Live external-service** - requires real Gemini API, Stripe, GitHub, Jira, Linear
- **Database/security verification** - manual Supabase queries, RLS checks

Reclassify all tests with accurate types.

**Priority Impact:** MEDIUM — classification accuracy

---

### 6. SLACK: CONFUSES REGRESSION WITH LIVE VERIFICATION (SCOPE)

**Finding:**
- TEST-CONN-004 (Slack OAuth Connect) noted as "Regression test only (frozen feature)"
- Implies Slack connection is already verified
- Actually: implementation regression verified; LIVE message delivery not yet verified
- Slack is a launch-advertised connector, not deferred

**Actual Status:**
- Slack implementation: frozen (bug-fixes only)
- Previous implementation regression: already verified per project memory
- Live Slack message delivery: NOT verified, still pending

**Correction:**
1. Separate into two concerns:
   - Regression (existing feature still works): covered by existing implementation tests
   - Live verification (Slack message actually delivered): new test needed if launching
2. Re-evaluate: Is Slack message delivery a launch requirement?
3. If YES: Add live Slack test to P0 phase
4. If NO: Mark as P1 or deferred
5. Do not assume "regression-only" means "fully verified for launch"

**Priority Impact:** MEDIUM — scope clarity

---

### 7. FINAL TEST COUNT RECALCULATION (IMPACT)

**Before Corrections:**
- P0: 32 tests (Tests 1-32)
- P1: 19 tests (Tests 33-51)
- P2: 5 tests (Tests 52-56)
- **Total: 56 tests**

**After Corrections:**
- Remove TEST-MEET-001, TEST-MEET-002, TEST-MEET-003 (moved to V2/Deferred)
- P0: 29 tests (Tests 1-29)
- P1: 19 tests (Tests 30-48)
- P2: 5 tests (Tests 49-53)
- **V2/Deferred: 3 tests (Meeting tests + existing V2 items)**
- **Total for Current Launch: 53 tests**

Test numbering changes:
- Tests 1-29: unchanged (Auth, Billing, Connectors, Autonomous, Jira, Linear, GitHub)
- Tests 30-48: former tests 33-51 (P1 Advanced) — renumbered
- Tests 49-53: former tests 52-56 (P2) — renumbered

**Priority Impact:** CRITICAL — affects all test references, execution order, documentation

---

## SUMMARY OF CRITICAL CORRECTIONS

| # | Finding | Type | Severity | Fix | Impact |
|---|---------|------|----------|-----|--------|
| 1 | Meetings incorrectly P0 | Scope | CRITICAL | Move to V2/Deferred | Test count 56→53, P0: 32→29 |
| 2 | Meeting billing wrong path | Implementation | MEDIUM | Trace actual path, remove countTokens assumption | TEST-BILL-003 accuracy |
| 3 | P0/P1 gates too permissive | Risk | HIGH | Category-specific 100% thresholds | Launch gate integrity |
| 4 | Dependencies overstated | Clarity | MEDIUM | Distinguish hard/soft dependencies | Execution understanding |
| 5 | Test types mislabeled | Accuracy | MEDIUM | Reclassify all tests accurately | Classification integrity |
| 6 | Slack regression ≠ launch ready | Scope | MEDIUM | Separate regression from live verification | Scope clarity |
| 7 | Test count not recalculated | Consistency | CRITICAL | Renumber all tests 1-53 | All documentation impact |

---

**Status:** CRITICAL CORRECTIONS IDENTIFIED — Documents require substantial revision before approval

