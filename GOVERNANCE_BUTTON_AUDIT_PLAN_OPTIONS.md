# PLAN BUTTONS & CHOOSE OPTION AUDIT
**Critical Governance UI Specification Gap**  
**Status:** Specification Only (Audit Phase)

---

## AUDIT FINDING

The initial GOVERNANCE_BUTTON_MATRIX.md specification was **incomplete**. It covered:
- ✓ Approve/Revise/Deny top-level plan
- ✓ Permission request buttons
- ✓ Finalization buttons

But **MISSING**:
- ✗ Buttons INSIDE plan cards (modify steps, select variants)
- ✗ Choose option buttons (select between alternative approaches)
- ✗ Step-level buttons within a multi-step plan
- ✗ Inline parameter selection (e.g., pick deployment target before approval)

---

## WHAT ARE PLAN BUTTONS?

Example scenario:

```
User: "Fix the About page"

Paw generates PLAN:
  1. Read current About page
  2. Identify issues
  3. [Choose approach: A, B, or C]
  4. Implement fix
  5. Run tests
  6. Commit changes

User MUST choose between approaches before plan can be approved.
```

**Plan buttons** are buttons that appear INSIDE a plan, allowing:
1. Choose between alternative steps
2. Toggle optional steps on/off
3. Select parameters (branch, environment, config)
4. Modify step order
5. Select implementation method

---

## WHAT ARE CHOOSE OPTION BUTTONS?

Example scenario:

```
Plan shows:

Option A: Use React (recommended)
Option B: Use Vue
Option C: Use Svelte

[Choose React]  [Choose Vue]  [Choose Svelte]
```

**Choose option buttons** appear when:
1. Multiple valid solution paths exist
2. Different tools/approaches could work
3. User needs to select one before execution
4. Recommendation can be highlighted

---

## TABLE 8: PLAN INTERNAL BUTTONS

| Button Type | When It Appears | Label | Function | Required Before Approval? | ALT+ENTER | Interaction |
|---|---|---|---|---|---|---|
| **Select Approach** | Plan has multiple methods | `[Use Approach A]`, `[Use Approach B]` | User selects ONE approach; other approaches hidden/grayed | YES | ALT+ENTER on focused button = select | Radio-button style; one selected at a time |
| **Toggle Optional Step** | Step marked as optional | `[✓ Include Step]` or `[Include Backup]` | User enables/disables optional steps | NO (user choice) | N/A | Checkbox style; multiple can be selected |
| **Select Parameter** | Step requires parameter choice | `[Branch: main ▼]`, `[Environment: Staging ▼]` | Dropdown/picker opens inline | YES (if required step) | ALT+ENTER = open picker | Dropdown shows options; click to select |
| **Modify Step Order** | User wants to reorder steps | `[↑ Move Up]`, `[↓ Move Down]` | Reorder steps | NO (convenience) | N/A | Drag-drop or arrow buttons |
| **Skip Step** | User wants to skip non-critical step | `[Skip This Step]` | Remove step from plan | NO (optional only) | N/A | Confirmation: "Are you sure?" |
| **Expand Step Details** | Need more info about a step | `[Show More]` or `[Details ▼]` | Reveal implementation details | NO (info only) | N/A | Expand/collapse |
| **Select Tool/Technology** | Multiple tools could accomplish step | `[Use Node.js]`, `[Use Python]` | Choose tool for this step | YES (if affects downstream) | ALT+ENTER on focused = select | Radio buttons or dropdown |
| **Set Target/Destination** | Step needs destination (deploy to which env?) | `[Deploy to: Staging ▼]` | Pick target environment | YES (required) | ALT+ENTER = open picker | Dropdown or search field |
| **Conditional Step** | Step depends on previous choice | `[If using React, also install dependencies]` | Enable/disable based on prior selections | NO (automatic) | N/A | Grayed out until condition met |

---

## TABLE 9: CHOOSE OPTION BUTTONS (Plan Selection Phase)

| Situation | Buttons Shown | Layout | Primary Button | Secondary | ALT+ENTER | Behavior |
|---|---|---|---|---|---|---|
| **Single best approach** | `[Use Recommended Approach]` | Card with checkmark | Primary = green | (no secondary) | ALT+ENTER = select | Auto-recommended; user can still change if Revise |
| **Multiple equal approaches** | `[Approach A]`, `[Approach B]`, `[Approach C]` | Card for each | None (user picks one) | (all equal) | ALT+ENTER on focused = select this one | Radio-button style; exactly one selected |
| **Recommended + alternatives** | `[✓ Recommended]`, `[Alternative A]`, `[Alternative B]` | Recommended highlighted | Recommended is blue | Alternatives gray | ALT+ENTER on focused = select | Clear recommendation; alternatives available |
| **Tool selection** | `[Use Tool A (faster)]`, `[Use Tool B (thorough)]` | Side-by-side cards | User picks | (both options) | ALT+ENTER on focused = select | Trade-offs shown (speed vs quality) |
| **Deployment target** | `[Deploy to Staging]`, `[Deploy to Production]` | Card per target | User picks based on risk | (both shown) | ALT+ENTER on focused = select | Risk indicators (staging = safe, prod = high risk) |
| **Complexity level** | `[Quick Fix ($5)]`, `[Thorough Fix ($25)]` | Cost shown clearly | User picks | (both shown) | ALT+ENTER on focused = select | Price and scope differences clear |
| **Batch vs individual** | `[Fix All (10 files)]`, `[Fix Selected Files]` | Option count shown | User picks scope | (both shown) | ALT+ENTER on focused = select | Scope and impact clear |

---

## PLAN BUTTON LAYOUT EXAMPLES

### Example 1: Plan with Approach Selection (BEFORE choosing)

```
┌────────────────────────────────────────┐
│ PLAN                                   │
│ ⚠️ Choose Implementation Approach       │
│ ──────────────────────────────────────│
│                                        │
│ Here's what I'll do (3 approaches):   │
│                                        │
│ ┌──────────────────────────────────┐  │
│ │ ✓ APPROACH A: React Refactor     │  │
│ │ (Recommended - modern, flexible) │  │
│ │ • Rewrite component structure    │  │
│ │ • Update state management        │  │
│ │ Effort: 2-3 hours                │  │
│ │                                  │  │
│ │          [Choose Approach A]     │  │
│ └──────────────────────────────────┘  │
│                                        │
│ ┌──────────────────────────────────┐  │
│ │  APPROACH B: Vue Migration       │  │
│ │ (Alternative - different stack)  │  │
│ │ • Convert to Vue syntax          │  │
│ │ • Adapt composition pattern      │  │
│ │ Effort: 3-4 hours                │  │
│ │                                  │  │
│ │          [Choose Approach B]     │  │
│ └──────────────────────────────────┘  │
│                                        │
│ ┌──────────────────────────────────┐  │
│ │  APPROACH C: Minimal Fix         │  │
│ │ (Quick - patch current issues)   │  │
│ │ • Target specific bugs           │  │
│ │ • Minimal refactoring            │  │
│ │ Effort: 30 mins                  │  │
│ │                                  │  │
│ │          [Choose Approach C]     │  │
│ └──────────────────────────────────┘  │
│                                        │
│ ──────────────────────────────────────│
│ [Revise Plan]            [Cancel]     │
└────────────────────────────────────────┘
```

**Behavior:**
- User MUST choose one approach before "Approve Plan" button appears
- Each option is a separate card
- Recommended (A) highlighted in blue
- Alternatives in gray
- Clicking "[Choose Approach X]" selects it
- After selection, plan updates to show only chosen steps
- Then "Approve Plan" button becomes available

---

### Example 2: Plan with Approach AFTER choosing

```
┌────────────────────────────────────────┐
│ PLAN                                   │
│ ✓ Approach: React Refactor             │
│ ──────────────────────────────────────│
│                                        │
│ Here's what I'll do:                  │
│                                        │
│ 1. Read component structure           │
│ 2. Analyze current state management   │
│ 3. [✓ Update to React hooks]          │
│    ├─ [Include useContext refactor]   │
│    └─ [Include custom hooks]          │
│ 4. Rewrite component files            │
│ 5. Run tests                          │
│ 6. Commit changes                     │
│                                        │
│ Total effort: ~2.5 hours              │
│                                        │
│ ──────────────────────────────────────│
│                                        │
│ [Approve Plan]  [Change Approach]     │
│                 [Revise]   [Deny]     │
└────────────────────────────────────────┘
```

**Behavior:**
- Once approach chosen, plan shows only those steps
- Optional steps appear with checkboxes
- User can toggle optional steps on/off (doesn't block approval)
- "[Change Approach]" button lets user go back and pick different approach
- "Approve Plan" now available

---

### Example 3: Plan with Parameter Selection

```
┌────────────────────────────────────────┐
│ PLAN                                   │
│ ⚠️ Select Deployment Target            │
│ ──────────────────────────────────────│
│                                        │
│ 1. Build application                  │
│ 2. Run tests                          │
│ 3. Deploy to: [Select Environment ▼]  │
│    ┌──────────────────────────────┐   │
│    │ Staging (safe, quick)        │   │
│    │ Production (live, high risk)  │   │
│    │ Canary (10% rollout)          │   │
│    └──────────────────────────────┘   │
│ 4. Verify deployment                  │
│ 5. Notify team                        │
│                                        │
│ ──────────────────────────────────────│
│                                        │
│ [Approve Plan]  [Revise]   [Deny]     │
└────────────────────────────────────────┘
```

**Behavior:**
- Dropdown picker required (can't approve without selection)
- Once selected, shows: "Deploy to: Staging" (e.g.)
- Alt+Enter opens dropdown, Tab selects option
- Approval blocked until choice made
- Error message if user tries "Approve Plan" without selecting

---

## PLAN BUTTONS: EXACT SPECIFICATIONS

### Rule 1: Approach Selection is BLOCKING
```
Requirement: Plan contains multiple valid approaches
Before approval: User MUST choose ONE
Selection shows: Chosen approach highlighted
Result: Plan updates to show chosen approach's steps
Next stage: Can now approve (or revise to change approach)
```

### Rule 2: Optional Steps are NON-BLOCKING
```
Requirement: Plan has optional/bonus steps
Before approval: User CAN toggle, but NOT required
Selection shows: [✓ Include Step] (checked) or [Include Step] (unchecked)
Result: Step included or excluded from plan
Next stage: Can approve regardless of selections
Behavior: User controls scope
```

### Rule 3: Required Parameters are BLOCKING
```
Requirement: Step needs parameter (deploy to which env?)
Before approval: User MUST select parameter
Selection shows: Dropdown/picker appears inline
Result: Parameter filled in
Next stage: Can now approve (or revise)
Behavior: Parameter required for plan to be executable
```

### Rule 4: Plan Button Focus & Keyboard
```
Tab navigation: Cycles through all buttons (approach cards, parameter pickers, etc.)
Alt+Enter: Confirms CURRENTLY FOCUSED choice
Escape: Cancel plan, return to THINKING stage (discard all selections)
Enter: If a text input, new line (not approval)
```

### Rule 5: Never Hide Approved Choices
```
Requirement: User chooses Approach A
After choosing: Show that Approach A is selected (visually confirm)
If revise: User can change approach, but current selection must show
Before: "Choose Approach" (all options visible)
After: "✓ Approach A Selected" (current choice highlighted, "Change Approach" button available)
```

---

## CHOOSE OPTION BUTTONS: EXACT SPECIFICATIONS

### Rule 1: Option Presentation
```
Scenario: Multiple solution paths are equally valid
Show: Cards for each option (not a dropdown, full cards)
Each card includes:
  • Option name/title
  • Brief description (what it does differently)
  • Trade-offs (speed vs quality, cost, complexity)
  • Single action button: "[Choose This Option]"
User: Clicks one button to select that option
Selected: Plan regenerates showing this option's approach
```

### Rule 2: Recommended Option
```
If one option is clearly better:
Show: "[✓ Recommended]" badge on that option
Make it: Blue/highlighted button
Other options: Gray, still selectable
User: Can still choose alternatives, but recommendation is clear
Alt+Enter on recommended: Selects it
```

### Rule 3: Option Selection is FINAL (for this run)
```
User selects: Option A
Plan shows: Steps for Option A
User clicks: "Approve Plan"
Plan runs with: Option A approach
If different approach needed: Next run, user can choose Option B
Cannot: Switch approaches mid-execution (must cancel and restart)
```

### Rule 4: Cost/Scope Transparency
```
If options have different costs:
Show: "[Quick Fix ($5)]" vs "[Thorough Fix ($25)]"
If options have different scope:
Show: "[Fix All (15 files)]" vs "[Fix Selected (3 files)]"
User: Makes informed choice before approval
Cannot: Say "cost unknown" or hide pricing
```

---

## TABLE 10: PLAN BUTTONS → STATE TRANSITIONS

| Button | Location | Current State | User Clicks | Plan State Changes | Result | Next Action |
|---|---|---|---|---|---|---|
| **[Choose Approach X]** | In plan card | PLAN (before selection) | Selects Approach X | Plan regenerates with only Approach X steps | Approach X confirmed | Plan updates display |
| **[Change Approach]** | In approved plan | PLAN (after selection) | Wants different approach | Back to approach selection (all options shown) | Previous choice cleared | User re-selects |
| **[✓ Include Optional Step]** | In plan step | PLAN (any time) | Toggle on/off | Step included or excluded | Optional step toggled | Approval unblocked |
| **[Deploy to: ▼]** | Inline in step | PLAN (before parameter selected) | Opens dropdown | Parameter picker shown | Dropdown opens | User selects from list |
| **[Staging]** (from dropdown) | Inside dropdown | PLAN (picker open) | Selects option | Parameter set to "Staging" | Deployment target confirmed | Plan shows "Deploy to: Staging" |
| **[Revise Plan]** | Below plan | PLAN (any state) | User wants changes | Return to input | Input field opens | User types revision |
| **[Approve Plan]** (blocked) | Bottom button | PLAN (required choice missing) | User tries to approve | ERROR: "Please choose approach" | Approval blocked | User must make selection first |
| **[Approve Plan]** (enabled) | Bottom button | PLAN (all required choices made) | User approves | Plan locked, move to PERMISSION_REQUEST | Plan finalized | Next: permission or execution |

---

## DEFERRED PLAN BUTTONS (Post-Launch)

These are NOT in current spec, mark as DEFERRED:

| Feature | Reason | Status |
|---------|--------|--------|
| **Drag-drop reorder steps** | Complex UI; current product doesn't support | DEFERRED |
| **Dynamic plan modification** | Add/remove steps after approval | DEFERRED |
| **Parallel step execution** | Run multiple steps simultaneously | DEFERRED |
| **Conditional branching** | "If this fails, do that instead" | DEFERRED |
| **Step rollback** | "Undo step 3 and retry from step 2" | DEFERRED |
| **A/B test approach** | "Run both approaches and show results" | DEFERRED |

---

## CRITICAL RULE: NEVER SILENT APPROVAL

```
DO NOT:
- Auto-select recommended approach without user clicking
- Auto-approve plan if only one approach exists
- Hide alternative approaches because one is recommended
- Change user's approach selection without confirmation

DO:
- Show all valid approaches
- Require explicit click to select one
- Confirm selection visually
- Let user change selection before approval
- Block approval until required choices made
- Show error message if user tries to approve without choosing
```

---

## SUMMARY: PLAN & OPTION BUTTONS

### Missing from Original Spec:
- ✗ Approach selection buttons (IN plan)
- ✗ Optional step toggle buttons
- ✗ Parameter selection buttons
- ✗ Choose option buttons (BEFORE plan approval)
- ✗ "Change approach" button
- ✗ Blocking vs non-blocking button types

### Now Specified:
- ✓ 8 types of plan internal buttons (Table 8)
- ✓ 6 choose option scenarios (Table 9)
- ✓ 3 layout examples with mockups
- ✓ 5 exact rules for plan buttons
- ✓ 4 exact rules for choose options
- ✓ State transitions (Table 10)
- ✓ Deferred features

### Button Behavior Summary:
| Type | Blocking | Required Before Approval? | Example |
|------|----------|---|---|
| Approach selection | YES | YES | User must pick React vs Vue vs Svelte |
| Optional steps | NO | NO | User can include/exclude bonus steps |
| Parameters | DEPENDS | YES (if required) | Must pick deployment target if step requires it |
| Toggle/Checkbox | NO | NO | User controls scope, approval not blocked |

---

**END OF AUDIT: PLAN BUTTONS & CHOOSE OPTIONS**

**STATUS:** Specification complete for plan-level and option-selection buttons.

**ACTION:** Update GOVERNANCE_BUTTON_MATRIX.md to include these two new tables (8, 9, 10) and rules.

**NO CODE CHANGES.** Audit only.

