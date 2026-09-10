# TEST PLAN CHANGELOG: V2 → V3 CORRECTED

**Date:** 2026-09-09  
**Version Update:** Revised V2 → Corrected V3  
**Changes:** Critical scope and classification corrections

---

## SUMMARY OF CHANGES

### Test Count
- **V2:** 56 tests (32 P0, 19 P1, 5 P2)
- **V3:** 53 tests (29 P0, 19 P1, 5 P2)
- **Reason:** Moved 3 Meeting tests out of P0 (backend-only, no renderer UI)

### Test Renumbering
- Tests 1-29: Authentication, Billing, Connectors, Autonomous (unchanged indices)
- Tests 30-48: P1 Advanced (formerly 33-51, renumbered)
- Tests 49-53: P2 Post-launch (formerly 52-56, renumbered)

---

## CRITICAL CORRECTIONS

### 1. MEETINGS SCOPE VIOLATION (CRITICAL FIX)

**What Changed:**
- **Removed from P0:** TEST-MEET-001, TEST-MEET-002, TEST-MEET-003
- **New Classification:** V2/Deferred (Part D)
- **Reason:** Backend implementation only; renderer UI consumer NOT implemented per project memory
- **Impact:** Product launches WITHOUT meetings feature

**Before V2:**
```
Phase 7: Meetings & Summarization (3 P0 tests, 1 hour)
30. TEST-MEET-001 — Create/Upload Meeting
31. TEST-MEET-002 — Request Meeting Summarization
32. TEST-MEET-003 — Meeting Persistence & Retrieval
```

**After V3:**
```
PART D: V2/DEFERRED FUNCTIONALITY
- Meeting Tests (Backend Only, No Renderer UI)
  - TEST-MEET-001, TEST-MEET-002, TEST-MEET-003: Deferred to V2
  - Status: Backend billing path verified; renderer UI deferred
  - Launch Impact: Meetings NOT part of current launch
  - Do NOT test as P0 launch requirements
```

**Evidence:** Project memory states "Communication Runtime frozen 2026-07-18; deferred items listed (WhatsApp/Telegram/Discord, mobile streaming, wake-word, Meetings rendering TBD...)"

---

### 2. MEETING BILLING TEST CORRECTION

**Test Affected:** TEST-BILL-002 (formerly TEST-BILL-003, renumbered)

**What Changed:**
- **Removed:** Expected result requiring autonomous countTokens() preflight
- **Removed:** Evidence requirement for Gemini countTokens API call
- **Corrected:** Traces actual meeting billing path (not autonomous path)

**Before V2:**
```
Expected Result:
  - Exact token count from Gemini countTokens() used (not heuristic)
Evidence Required:
  - DevTools Network tab shows Gemini countTokens API call
```

**After V3:**
```
Expected Result:
  - Billing event created in organization_billing_events
  - Event type: 'meeting_summarization'
  - CreditStore usage recorded via meetingHandler
  - Tier Compute balance decremented

Evidence Required:
  - Screenshots: before/after balance
  - Supabase query: SELECT * FROM organization_billing_events WHERE event_type = 'meeting_summarization'
  
Note: Meeting billing uses actual runtime path (meetingHandler → recordUsageEvent → CreditStore.consume), NOT autonomous countTokens preflight
```

**Reason:** Confused autonomous Work PC authorization with meeting Tier Compute billing. Actual meeting path is direct creditStore.consume() call, not preflight-based.

---

### 3. P0/P1 LAUNCH GATES TIGHTENED

**What Changed:**
- **Replaced:** Blanket "P1 tests: 90% pass rate acceptable"
- **Added:** Category-specific thresholds
- **100% Required (No Exceptions):**
  - Authentication/security (Tests 1-5)
  - Billing/accounting (Tests 6-9)
  - Autonomous authorization/reservation/settlement (Tests 16-23)
  - RLS/data isolation (Tests 30-32)
  - IPC boundary security (Test 33)
  - Advertised launch connector write-back (Tests 25, 27, 29)
- **90% Acceptable:**
  - Performance/resilience (Tests 39-40)
  - Non-critical advanced features (Tests 34-38, 41-48)

**Before V2:**
```
**MUST PASS (P0):**
- All 32 P0 tests

**SHOULD PASS (P1):**
- 90% pass rate acceptable
- Up to 5 P1 failures can be documented as known issues
```

**After V3:**
```
**MANDATORY (100% Pass Required):**
- All 29 P0 tests
- P1 Critical (RLS, IPC, security): 100%
- All advertised launch connector capabilities: 100%
- Autonomous authorization/settlement: 100%
- Billing/accounting: zero double-charges: 100%

**IMPORTANT (90% Pass Acceptable):**
- P1 Non-critical performance/resilience
- Advanced features already verified

**POST-LAUNCH (100% Deferrable):**
- All 5 P2 tests
```

**Reason:** Single failure in security, billing, data-integrity, or autonomous-accounting cannot be hidden in aggregate scoring. Different categories have different risk tolerance.

---

### 4. TEST TYPE CLASSIFICATIONS CORRECTED

**What Changed:**
- Audited every test classification for accuracy
- Reclassified tests with manual inspection components
- Fixed misleading "Automated" labels

**Examples:**

**TEST-AUTO-002 (Executor Claiming)**
- **V2:** "Type: Unit + Integration"
- **V3:** "Type: Manual source inspection + Database verification"
- **Reason:** Requires manual console log inspection, not purely automated code execution

**TEST-AUTO-004 (Token Preflight)**
- **V2:** "Type: Unit + Integration + Live External Service"
- **V3:** "Type: Live external-service (Gemini API) + Manual inspection"
- **Reason:** Requires DevTools Network tab observation, not just code validation

**TEST-SEC-P1-001 (RLS)**
- **V2:** Single test labeled "RLS enforcement verification"
- **V3:** Three separate tests:
  - **TEST-SEC-P1-001A:** Static/source verification (CREATE POLICY in migrations)
  - **TEST-SEC-P1-001B:** Database/security verification (query staging Supabase schema)
  - **TEST-SEC-P1-001C:** Database/security verification (cross-user access test)
- **Reason:** Three distinct verification layers, not one

**Accurate Type Categories Now Used:**
- Automated unit
- Automated integration
- Static/source verification
- Manual Electron/runtime
- Staging/E2E
- Live external-service
- Database/security verification
- Manual inspection + DB verification (hybrid)

---

### 5. SLACK SCOPE CLARIFICATION

**What Changed:**
- Separated "implementation regression" from "live message delivery verification"
- Clarified that regression test is NOT proof of launch readiness

**Before V2:**
```
TEST-CONN-004: Slack OAuth Connect
- Status: REGRESSION TEST ONLY (frozen feature)
- Implies: Slack connection already verified
```

**After V3:**
```
TEST-CONN-004: Slack OAuth Connect (Regression)
- Type: Staging/E2E
- Status: REGRESSION TEST — implementation frozen (bug-fixes only)
- Note: Live Slack message delivery verification is SEPARATE (P1 or deferred)
- Implementation regression: existing feature still works
- Live verification: Slack message actually delivered — still pending if launching
```

**Reason:** Frozen implementation means existing tests still work, not that live message delivery is verified. If Slack messaging is advertised as launch feature, needs live test.

---

### 6. DEPENDENCY DOCUMENTATION IMPROVED

**What Changed:**
- Explicitly marked HARD vs SOFT/recommended dependencies
- Clarified which tests are truly independent
- Removed false cascading dependencies

**Before V2:**
```
"Keep tests executed ONE AT A TIME because that is the requested execution method.
All tests depend on preceding tests."
```

**After V3:**
```
HARD DEPENDENCIES (must complete before dependent tests):
- TEST-AUTH-001 → ALL other tests (creates user)
- TEST-BILL-004 → Tests 16-23 (Work PC balance)
- TEST-CONN-001 → Tests 24, 28 (GitHub)
- TEST-CONN-002 → Tests 25 (Jira)
- TEST-CONN-003 → Tests 26 (Linear)
- Tests 16-20 → Tests 21-23 (architecture)

SOFT/RECOMMENDED ORDER (logical grouping, not hard blocking):
- Phase sequence for coherence, but not strict dependencies
- E.g., Jira tests independent of Linear tests (only need own connector)
- E.g., Slack tests independent of Jira/Linear/GitHub (only need Slack)

ACTUAL DEPENDENCY GRAPH:
[Visual dependency chart provided]
```

**Reason:** False cascading dependency implies must execute ALL tests even if some fail. Actual dependencies are more limited, enabling better test isolation.

---

### 7. FINAL TEST COUNT IMPACT

**Renumbering Table:**
```
V2 Test # → V3 Test # | Test Name | Change
1-29      → 1-29     | Auth, Billing, Connectors, Autonomous | NO CHANGE (indices preserved)
30-32     → MOVED    | Meetings (MEET-001, 002, 003) | MOVED TO V2/DEFERRED
33-51     → 30-48    | P1 Advanced | RENUMBERED (down by 3)
52-56     → 49-53    | P2 Post-launch | RENUMBERED (down by 3)
```

**Total Impact:**
- V2: 56 tests (32 P0, 19 P1, 5 P2)
- V3: 53 tests (29 P0, 19 P1, 5 P2, +3 V2/Deferred)
- Tests 1-29 stay at same numbers
- Tests 30+ renumbered down by 3

---

### 8. LAUNCH GATE TIGHTENING

**Before V2:**
```
LAUNCH GO/NO-GO DECISION:
- MUST PASS (P0): Tests 1-32 = 100% must pass
- SHOULD PASS (P1): Tests 33-51 = 90% pass rate acceptable (up to 5 failures)
- CAN DEFER (P2): Tests 52+ = 100% deferrable to post-launch
```

**After V3:**
```
LAUNCH GO/NO-GO DECISION:
- MANDATORY (100%): All 29 P0 tests + P1 Critical (RLS, security)
- IMPORTANT (90% Non-Critical Only): P1 non-critical performance/resilience
- POST-LAUNCH (100% Deferrable): All 5 P2 tests + all V2/Deferred

CRITICAL RULE: Single failure in security, billing, data-integrity, or 
autonomous-accounting cannot be hidden in aggregate scoring. These have 
100% pass thresholds.
```

**Reason:** Better risk separation — non-blocking resilience issues shouldn't hide accounting bugs.

---

### 9. GITHUB PR CREATION STATUS (No Change)

**Still Dormant:**
- TEST-GITHUB-03: GitHub PR Creation remains STUB implementation
- Status: NOT a launch requirement
- Note: Added to Part D (Dormant)
- Do NOT test for launch

---

### 10. JIRA/LINEAR/GITHUB SCOPE (No Change)

**Remains as Implemented:**
- Jira: Read + Comment + Done transition (P0)
- Linear: Read + Comment + Done transition (P0)
- GitHub: Read + Comment on existing PRs (P0)
- PR creation: Dormant (not tested)

---

### 11. BILLING TERMINOLOGY (No Change)

**Remains Distinct:**
- Tier Compute: Normal AI usage (tokens, creditStore.consume)
- Work PC: Autonomous execution (PC units, settle_autonomous_task_run_pc)
- Never use "tokens" for Work PC
- Never confuse the two billing systems

---

### 12. AUTONOMOUS CANCELLATION (No Change)

**Still Two Distinct Tests:**
- TEST-AUTO-P1-004: Cancellation before provider work → zero Work PC charged
- TEST-AUTO-P1-005: Cancellation after provider work → actual Work PC settled

---

### 13. RLS VERIFICATION LAYERS (No Change)

**Still Three Layers:**
- Layer A: migration/source verification (already done)
- Layer B: deployed schema verification (staging/live DB needed)
- Layer C: actual cross-user enforcement (staging/live DB needed)

---

## DOCUMENTS UPDATED

### 1. TEST_PLAN_AUDIT_V2.md (NEW)
- Documents all 11 original corrections from V1 audit
- Identifies 7 additional critical corrections needed (total 18 finding sets across V2)

### 2. COMPREHENSIVE_TEST_PLAN_CORRECTED.md (REPLACES V2)
- Complete rewrite with test count 56 → 53
- Part A: P0 tests (29 tests, 1-29)
  - Moved Meetings to Part D
  - Corrected TEST-BILL-002 (former TEST-BILL-003)
  - All tests 1-29 retain same numbers
- Part B: P1 tests (19 tests, 30-48)
  - Renumbered from former 33-51
  - Added category-specific launch gates
  - Added accurate test type classifications
  - Added HARD vs SOFT dependency notes
- Part C: P2 tests (5 tests, 49-53)
  - Renumbered from former 52-56
- Part D: V2/Deferred (includes 3 Meeting tests)

### 3. FINAL_TEST_EXECUTION_ORDER_CORRECTED.md (REPLACES V2)
- Execution order for 53 tests (not 56)
- Tests renumbered 1-53
- Dependency chart updated
- HARD vs SOFT dependencies clearly marked
- Phase structure preserved but test counts updated
- Launch gate criteria tightened (category-specific)

---

## WHAT STAYED THE SAME

✅ Implementation frozen (no code changes)  
✅ No migrations changed  
✅ No entitlement matrix changed  
✅ Autonomous architecture (Phase 2B/C/D) unchanged  
✅ Billing separation (Tier Compute vs Work PC) unchanged  
✅ Jira/Linear/GitHub scope (comment + Done transition)  
✅ GitHub PR creation remains dormant  
✅ All 11 original audit corrections applied  

---

## WHAT CHANGED CRITICALLY

❌ Test count: 56 → 53 (removed meetings from P0)  
❌ P0 tests: 32 → 29 (removed 3 meeting tests)  
❌ Test renumbering: All P1/P2 tests renumbered  
❌ Launch gates: Replaced blanket 90% with category-specific 100%  
❌ Test classifications: Corrected "Automated" labels, added accuracy  
❌ Dependencies: Separated HARD from SOFT, removed false cascading  
❌ Slack scope: Separated regression from live verification  
❌ Meeting billing test: Corrected from autonomous to actual path  

---

## APPROVALS REQUIRED BEFORE EXECUTION

1. ✅ Test count change (56 → 53) accepted?
2. ✅ Meeting tests moved to V2/Deferred accepted?
3. ✅ Test renumbering (1-53) acceptable?
4. ✅ Category-specific launch gates (100% for critical) accepted?
5. ✅ Dependency clarification (HARD vs SOFT) accepted?
6. ✅ All test type classifications accurate?

---

**Status:** V3 CORRECTIONS COMPLETE — READY FOR APPROVAL

