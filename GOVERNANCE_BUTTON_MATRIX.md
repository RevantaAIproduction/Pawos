# GOVERNANCE BUTTON UI SPECIFICATION
**PawOS Companion Panel — Approval & Execution UI**  
**Date:** 2026-08-30  
**Status:** Specification Only (No Implementation Yet)

---

## EXECUTIVE SUMMARY

This document defines:
- Exact button appearance at every stage
- Permission request UI
- Keyboard shortcuts
- State transitions
- Layout specifications
- Deferred features

**Key Rule:** ALT+ENTER approves the CURRENTLY FOCUSED permission action only.

---

## TABLE 1: STAGE → BUTTONS MATRIX

| Stage | Situation | User Sees | Primary Button | Secondary Button(s) | Destructive | ALT+ENTER | Opens Input | Auto-Continue | Requires Permission | Next Stage |
|-------|-----------|-----------|---|---|---|---|---|---|---|---|
| **IDLE** | Chat open, no action | Text input, send button | Send | (voice, attach) | No | N/A | Yes (text) | No | No | THINKING |
| **THINKING** | Paw analyzing | "Paw is thinking..." | — | Cancel | No | N/A | No | Yes | No | PLAN or UNDERSTANDING |
| **UNDERSTANDING** | Paw analyzing, shows progress | "Reading files", "Analyzing..." | — | Cancel | No | N/A | No | Yes | No | PLAN or RUNNING |
| **PLAN (Approval Needed)** | Plan contains destructive/restricted action | Plan steps, risk indicator | Approve Plan | Revise, Deny | Varies | ALT+ENTER = Approve | Revise opens input | No | Yes (on Approve) | PERMISSION_REQUEST or RUNNING |
| **PLAN (No Approval)** | Plan is read-only safe | Plan steps | Run Plan | Revise | No | ALT+ENTER = Run | Revise opens input | No | No | PERMISSION_REQUEST or RUNNING |
| **PERMISSION_REQUEST** | Single permission paused task | "Allow me to [ACTION]", resource, reason | [Allow me to ACTION] | Deny | No | ALT+ENTER = Allow | No | No | Yes | RUNNING or WAITING_FOR_PERMISSION |
| **PERMISSION_REQUEST (Batch)** | Multiple permissions (if applicable) | First permission focused | [Allow me to ACTION] | Deny, Next Permission | No | ALT+ENTER = Allow this one | No | Yes to next perm | Yes | RUNNING |
| **RUNNING** | Execution in progress | Status, steps, progress | — | Pause, Cancel | No | N/A | No | Yes | No | WAITING_FOR_PERMISSION or RUNNING (next step) |
| **WAITING_FOR_PERMISSION** | Mid-execution pause | "Execution paused", current permission | [Allow me to ACTION] | Deny, Cancel | No | ALT+ENTER = Allow | No | No | Yes | RUNNING |
| **COMPLETED (Success)** | Task finished, result shown | Result, before/after | Accept | Needs Changes | No | ALT+ENTER = Accept | No | No | No | FINALIZATION |
| **COMPLETED (No Action)** | Read-only task done | "Analysis complete" | Done | — | No | ALT+ENTER = Done | No | Yes | No | IDLE |
| **COMPLETED (No Result)** | Terminal/info output only | Output displayed | Done | — | No | ALT+ENTER = Done | No | Yes | No | IDLE |
| **REVIEW (Needs Changes)** | User clicked "Needs Changes" | Input for revision, current result | Revise | Cancel | No | ALT+ENTER = Revise | Yes (text) | No | No | UNDERSTANDING or RUNNING |
| **FINALIZATION** | User clicked "Accept" | Options: Save, Commit, Push, Deploy, Comment, Done | (Context-specific) | Done (skip finalization) | Yes (Deploy) | ALT+ENTER = primary action | Varies | No | Yes (per action) | DONE or running that action |
| **SAVE_PENDING** | User selected "Save" | "Save locally?" confirmation | [Save] | Cancel | No | ALT+ENTER = Save | No | No | No | DONE |
| **COMMIT_PENDING** | User selected "Commit" | Message input area | [Commit] | Cancel | No | ALT+ENTER = Commit | Yes (message) | No | Yes (git permission) | DONE or PERMISSION_REQUEST |
| **PUSH_PENDING** | User selected "Push" | Branch/remote confirmation | [Push] | Cancel | No | ALT+ENTER = Push | No | No | Yes (git permission) | DONE or PERMISSION_REQUEST |
| **DEPLOY_PENDING** | User selected "Deploy" | Deploy target selection | [Deploy] | Cancel | Yes | ALT+ENTER = Deploy | Varies | No | Yes (deploy permission) | DONE or PERMISSION_REQUEST |
| **COMMENT_PENDING** | User selected "Comment on Ticket" | Comment input (if write-back supported) | [Add Comment] | [Don't Comment], Cancel | No | ALT+ENTER = Comment | Yes (comment text) | No | Yes (connector write) | DONE or FINALIZATION |
| **DONE** | Task complete, no more actions | "✓ Task Complete", summary | — | New Chat | No | N/A | No | No | No | IDLE |
| **FAILED** | Execution error | Error message, retry option | [Retry] or [Revise] | [Cancel] | No | ALT+ENTER = Retry | No | No | Depends | UNDERSTANDING or IDLE |
| **CANCELLED** | User cancelled | "Cancelled" message | New Chat | — | No | N/A | No | Yes | No | IDLE |

---

## TABLE 2: PERMISSION TYPE → BUTTON SPECIFICATION

| Permission Type | Button Label | When It Appears | Resource Reference | ALT+ENTER | Approval | Resumes | Denies To | Risk Level |
|---|---|---|---|---|---|---|---|---|
| **Read/Inspect** | Allow me to Inspect | Inspect action requested | File/folder path | ✓ approve | Policy-based | Same task | PLANNING | Low |
| **Analyze** | Allow me to Analyze | Analysis requested | Folder/repository | ✓ approve | Policy-based | Same task | PLANNING | Low |
| **Edit File** | Allow me to Edit | File edit requested | File path, line range | ✓ approve | Policy-based | Same task | PLANNING | Medium |
| **Edit Multiple Files** | Allow me to Edit Files | Bulk edit requested | File list | ✓ approve | Policy-based | Same task | PLANNING | Medium |
| **Run Command** | Allow me to Run | Shell command requested | Command string | ✓ approve | Policy-based | Same task | PLANNING | Medium |
| **Run Tests** | Allow me to Run Tests | Test suite requested | Test path | ✓ approve | Policy-based | Same task | PLANNING | Low |
| **Build Project** | Allow me to Build | Build requested | Build tool/target | ✓ approve | Policy-based | Same task | PLANNING | Medium |
| **Install Software** | Allow me to Install | Package install requested | Package name, version | ✓ approve | Policy-based | Same task | PLANNING | Medium |
| **Update Software** | Allow me to Update | Software update requested | Package name | ✓ approve | Policy-based | Same task | PLANNING | Medium |
| **Uninstall Software** | Allow me to Uninstall | Uninstall requested | Package name | ✓ approve | Policy-based | Same task | PLANNING | Medium |
| **Configure Path** | Allow me to Configure Path | PATH env var change | Path entry | ✓ approve | Policy-based | Same task | PLANNING | High |
| **Set Environment Variable** | Allow me to Set Env Var | Env var creation/change | Variable name/value | ✓ approve | Policy-based | Same task | PLANNING | Medium |
| **Git Add** | Allow me to Stage Files | Git add requested | Files list | ✓ approve | Policy-based | Same task | PLANNING | Low |
| **Git Commit** | Allow me to Commit | Commit requested | Commit message | ✓ approve | Policy-based | Same task | PLANNING | Low |
| **Git Push** | Allow me to Push | Push requested | Branch, remote | ✓ approve | Policy-based | Same task | PLANNING | High |
| **Git Revert** | Allow me to Revert | Revert requested | Commit SHA | ✓ approve | Policy-based | Same task | PLANNING | High |
| **Deploy** | Allow me to Deploy | Deployment requested | Environment/target | ✓ approve | Policy-based | Same task | PLANNING | High |
| **Connector Action** | Allow me to Use [Connector] | Connector action (Jira, Linear, etc.) | Resource reference | ✓ approve | Entitlement-based | Same task | PLANNING | Medium |
| **Screenshot** | Allow me to Take Screenshot | Screenshot requested | Window/region | ✓ approve | Policy-based | Same task | PLANNING | Low |
| **Autonomous Task** | Allow me to Solve [Ticket] | Autonomous execution | Ticket ID | ✓ approve | Entitlement + governance | Same task | PLANNING | High |

---

## TABLE 3: KEYBOARD SHORTCUTS

| Shortcut | Action | Context | Focused Element | Behavior |
|----------|--------|---------|---|---|
| **ALT+ENTER** | Approve currently focused permission/action | Permission request is visible | Permission button or first approval button | Triggers ALLOW, APPROVE, ACCEPT, or primary action depending on context |
| **ALT+ENTER** | Run plan (if no approval needed) | Plan stage | Plan card | Starts execution |
| **ALT+ENTER** | Accept result | Completed stage | Accept button | Moves to FINALIZATION |
| **ALT+ENTER** | Finalize primary action | FINALIZATION stage | Primary finalization button (Save/Commit/Deploy) | Executes primary action |
| **ESCAPE** | Cancel current stage | Any running/permission/input stage | Anywhere | Returns to PLANNING or IDLE |
| **ENTER** | Submit input | Input area focused (chat, revise, commit message, comment) | Input field | Submits text (does not approve permissions) |
| **SHIFT+ENTER** | Line break | Chat input focused | Text area | Inserts newline (does not submit) |
| **TAB** | Next element | Anywhere in Companion Panel | Current element | Cycles through buttons/inputs; next ALT+ENTER applies to newly focused element |
| **SHIFT+TAB** | Previous element | Anywhere | Current element | Cycles backward |

**CRITICAL:** ALT+ENTER must NEVER execute a destructive action without explicit approval. It only approves the currently focused permission, nothing more.

---

## TABLE 4: BUTTON → STATE TRANSITION

| Button | Clicked | Current Stage | Next Stage | Action | Emit Event |
|--------|---------|---|---|---|---|
| **Send** | In IDLE | IDLE | THINKING | Submit text input to reasoning | N/A |
| **Approve Plan** | In PLAN | PLAN | PERMISSION_REQUEST (if needed) or RUNNING | Accept plan, proceed | `execution:planApproved` |
| **Revise Plan** | In PLAN | PLAN | REVIEW | Open input for plan revision | `execution:planRequiresRevision` |
| **Deny Plan** | In PLAN | PLAN | IDLE | Reject plan, return to chat | `execution:planDenied` |
| **Run Plan** | In PLAN | PLAN | PERMISSION_REQUEST (if needed) or RUNNING | Execute plan (when no approval needed) | `execution:planApproved` |
| **[Allow me to ACTION]** | In PERMISSION_REQUEST | PERMISSION_REQUEST | RUNNING | Grant permission, continue execution | `governance:permissionGranted` |
| **Deny** | In PERMISSION_REQUEST | PERMISSION_REQUEST | PLANNING or CANCELLED | Reject permission, fail task | `governance:permissionDenied` |
| **Cancel** | In RUNNING/WAITING | RUNNING or WAITING_FOR_PERMISSION | CANCELLED | Stop execution | `execution:cancelled` |
| **Pause** | In RUNNING | RUNNING | PAUSED | Suspend execution (if supported) | `execution:paused` |
| **Accept** | In COMPLETED | COMPLETED | FINALIZATION | Accept result, show finalization options | `execution:accepted` |
| **Needs Changes** | In COMPLETED | COMPLETED | REVIEW | Reject result, request revision | `execution:needsRevision` |
| **Revise** | In REVIEW | REVIEW | UNDERSTANDING | Re-submit with changes | `execution:reworkRequested` |
| **Save** | In FINALIZATION | FINALIZATION | SAVE_PENDING | Prepare local save | `finalization:saveInitiated` |
| **[Save]** (confirm) | In SAVE_PENDING | SAVE_PENDING | DONE | Execute save | `finalization:saved` |
| **Commit** | In FINALIZATION | FINALIZATION | COMMIT_PENDING | Prepare git commit | `finalization:commitInitiated` |
| **[Commit]** (confirm) | In COMMIT_PENDING | COMMIT_PENDING | DONE or PERMISSION_REQUEST | Execute commit (may need git permission) | `finalization:committed` |
| **Push** | In FINALIZATION | FINALIZATION | PUSH_PENDING | Prepare git push | `finalization:pushInitiated` |
| **[Push]** (confirm) | In PUSH_PENDING | PUSH_PENDING | DONE or PERMISSION_REQUEST | Execute push (may need git permission) | `finalization:pushed` |
| **Deploy** | In FINALIZATION | FINALIZATION | DEPLOY_PENDING | Prepare deployment | `finalization:deployInitiated` |
| **[Deploy]** (confirm) | In DEPLOY_PENDING | DEPLOY_PENDING | DONE or PERMISSION_REQUEST | Execute deployment | `finalization:deployed` |
| **Comment** | In FINALIZATION | FINALIZATION | COMMENT_PENDING | Prepare ticket comment | `finalization:commentInitiated` |
| **[Add Comment]** (confirm) | In COMMENT_PENDING | COMMENT_PENDING | DONE or PERMISSION_REQUEST | Write comment to ticket | `finalization:commented` |
| **Done** | In FINALIZATION, COMPLETED, or CANCELLED | Various | IDLE or DONE | Complete conversation | `execution:complete` |
| **Retry** | In FAILED | FAILED | UNDERSTANDING or RUNNING | Restart execution | `execution:retryInitiated` |
| **New Chat** | In DONE or IDLE | DONE or IDLE | IDLE | Clear conversation, start new | `conversation:reset` |

---

## TABLE 5: STAGE → UI LAYOUT

### IDLE Stage
```
┌────────────────────────────────────┐
│ COMPANION                          │
│ ────────────────────────────────── │
│                                    │
│ [Prior conversation or empty]      │
│                                    │
│ ────────────────────────────────── │
│ Text input area:                   │
│                                    │
│ [Attach 📎] [Mode ▾]               │
│ ┌──────────────────────────────┐   │
│ │ Type your request here...    │   │
│ │ (Shift+Enter for new line)   │   │
│ └──────────────────────────────┘   │
│                   [Send] (disabled if limit reached) │
└────────────────────────────────────┘
```

**Behavior:**
- Text input always focused
- Send button active if: draft exists, credits available, tier allows
- Attach button always available
- Mode picker shows execution mode (Manual/Accept/Plan/Auto)
- Alt+Enter in input NOT mapped (use Enter to submit)

---

### THINKING Stage
```
┌────────────────────────────────────┐
│ PAW IS THINKING...                 │
│ ────────────────────────────────── │
│                                    │
│ Reading files                      │
│ Analyzing structure                │
│                                    │
│ [animated progress dots]           │
│                                    │
│                            [Cancel] │
└────────────────────────────────────┘
```

**Behavior:**
- Read-only, no input
- Cancel button available (stops reasoning)
- Auto-transitions to PLAN or UNDERSTANDING

---

### PLAN Stage (With Approval Required)
```
┌────────────────────────────────────┐
│ PLAN                               │
│ ⚠️ Requires Your Approval          │
│ ────────────────────────────────── │
│                                    │
│ Here's what I'll do:               │
│ 1. [icon] Read file structure      │
│ 2. [icon] Modify component (R)     │
│ 3. [icon] Run tests (R)            │
│ 4. [icon] Verify                   │
│                                    │
│ (R) = requires approval            │
│ ⚠️ Risk: Medium (file edit)         │
│                                    │
│ ────────────────────────────────── │
│                                    │
│ [Approve Plan]  [Revise]  [Deny]   │
└────────────────────────────────────┘
```

**Behavior:**
- Red header if destructive actions present
- Risk indicator shown (Low/Medium/High)
- Primary button: "Approve Plan"
- Secondary buttons: "Revise" (opens input), "Deny"
- Alt+Enter on card = Approve
- Revise opens text input: "What should I change in this plan?"

---

### PLAN Stage (No Approval)
```
┌────────────────────────────────────┐
│ PLAN                               │
│ ────────────────────────────────── │
│                                    │
│ Here's what I'll do:               │
│ 1. [icon] Read file structure      │
│ 2. [icon] Analyze                  │
│ 3. [icon] Verify                   │
│                                    │
│ All actions: read-only (no approval needed) │
│                                    │
│ ────────────────────────────────── │
│                                    │
│ [Run Plan]           [Revise]      │
└────────────────────────────────────┘
```

**Behavior:**
- No warning icon
- Primary button: "Run Plan"
- Alt+Enter = Run Plan
- Revise still available for user-requested changes

---

### PERMISSION_REQUEST Stage
```
┌────────────────────────────────────┐
│ PERMISSION REQUIRED                │
│ ────────────────────────────────── │
│                                    │
│ Allow me to Edit                   │
│ src/app/about/page.tsx             │
│                                    │
│ Reason: Fix the About page layout  │
│                                    │
│ Resources affected:                │
│ • src/app/about/page.tsx           │
│ • src/app/layout.tsx (dependency)  │
│                                    │
│ ────────────────────────────────── │
│                                    │
│ [Allow me to Edit]         [Deny]  │
│                                    │
│ (ALT+ENTER = Allow)                │
└────────────────────────────────────┘
```

**Behavior:**
- Clear title: "PERMISSION REQUIRED"
- Action bolded: "Allow me to Edit"
- Resource shown: exact file/folder path
- Reason provided: what the edit accomplishes
- Dependent resources listed if applicable
- Primary button: "[Allow me to Edit]" (green/positive)
- Deny button: red/negative
- Alt+Enter on focused button = Allow
- Tab cycles between Allow and Deny

---

### PERMISSION_REQUEST (Multiple in Batch)
```
┌────────────────────────────────────┐
│ PERMISSIONS REQUIRED (2 of 3)      │
│ ────────────────────────────────── │
│                                    │
│ ► Allow me to Run npm test         │
│ • Allow me to Commit               │
│ • Allow me to Push                 │
│                                    │
│ [Reason for npm test]              │
│                                    │
│ ────────────────────────────────── │
│                                    │
│ [Allow me to Run Tests]    [Deny]  │
│                                    │
│ Progress: ✓ Edit  ► Run Tests  Push│
└────────────────────────────────────┘
```

**Behavior:**
- Shows counter "2 of 3" permissions
- Focused permission highlighted with ►
- Other permissions dimmed/collapsed
- Once current permission approved, auto-shows next
- Progress bar at bottom shows status
- User cannot skip permissions (must deny or allow each)

---

### RUNNING Stage
```
┌────────────────────────────────────┐
│ RUNNING                            │
│ ────────────────────────────────── │
│                                    │
│ Modifying About page               │
│                                    │
│ ✓ Inspecting structure             │
│ ✓ Analyzing impact                 │
│ ● Editing files (2/4)              │
│ ○ Running tests                    │
│ ○ Verification                     │
│                                    │
│ [Last action output]               │
│                                    │
│ ────────────────────────────────── │
│                                    │
│                    [Pause] [Cancel] │
└────────────────────────────────────┘
```

**Behavior:**
- Title: "RUNNING"
- Subtitle: human-friendly task description
- Steps shown with status (✓, ●, ○ for done/running/pending)
- Step counter if multi-step
- Latest output visible (log lines, file contents)
- Pause button available (if step supports mid-pause)
- Cancel button available (stops immediately)
- Auto-scrolls to latest output
- Alt+Enter NOT mapped (no action during execution)

---

### WAITING_FOR_PERMISSION Stage
```
┌────────────────────────────────────┐
│ EXECUTION PAUSED                   │
│ ────────────────────────────────── │
│                                    │
│ Your permission is needed.         │
│                                    │
│ Allow me to Push                   │
│ origin/feature-branch → main       │
│                                    │
│ Reason: Finalize the fix           │
│                                    │
│ ────────────────────────────────── │
│                                    │
│ [Allow me to Push]         [Deny]  │
│                                    │
│ (Execution paused at step 4 of 5)  │
└────────────────────────────────────┘
```

**Behavior:**
- Title: "EXECUTION PAUSED"
- Same permission UI as PERMISSION_REQUEST
- Shows progress: "at step 4 of 5"
- Allow button resumes same execution (no duplicate)
- Deny button cancels and returns to planning
- Task persists in background until approved/denied

---

### COMPLETED Stage (Success with Result)
```
┌────────────────────────────────────┐
│ ✓ COMPLETE                         │
│ ────────────────────────────────── │
│                                    │
│ About page layout fixed.           │
│                                    │
│ Changes:                           │
│ • Fixed grid layout                │
│ • Updated responsive behavior      │
│ • Added accessibility fixes        │
│                                    │
│ ────────────────────────────────── │
│                                    │
│ [Accept]   [Needs Changes]         │
│                                    │
│ (ALT+ENTER = Accept)               │
└────────────────────────────────────┘
```

**Behavior:**
- Green checkmark in title
- Summary of what was done
- Changes listed as bullet points
- Primary button: "Accept" (green)
- Secondary button: "Needs Changes" (yellow)
- Alt+Enter on Accept = Accept
- Needs Changes opens REVIEW

---

### COMPLETED Stage (Read-Only, No Further Action)
```
┌────────────────────────────────────┐
│ ✓ ANALYSIS COMPLETE                │
│ ────────────────────────────────── │
│                                    │
│ Project structure analyzed.        │
│                                    │
│ Key findings:                      │
│ • 42 files scanned                 │
│ • 3 dependencies found             │
│ • 0 issues detected                │
│                                    │
│ ────────────────────────────────── │
│                                    │
│                           [Done]   │
└────────────────────────────────────┘
```

**Behavior:**
- Only "Done" button (no Accept/Needs Changes)
- Auto-dismisses after 3 seconds (optional)
- Alt+Enter = Done
- Returns to IDLE

---

### REVIEW Stage (Needs Changes Input)
```
┌────────────────────────────────────┐
│ REVISE PLAN                        │
│ ────────────────────────────────── │
│                                    │
│ Current result:                    │
│ [Brief summary of what was done]   │
│                                    │
│ What would you like changed?       │
│                                    │
│ ┌──────────────────────────────┐   │
│ │ Type changes here...         │   │
│ │ e.g., "Make it smaller"      │   │
│ │                              │   │
│ │ (or paste images/files)      │   │
│ └──────────────────────────────┘   │
│                                    │
│ ────────────────────────────────── │
│                                    │
│ [Revise]             [Cancel]      │
└────────────────────────────────────┘
```

**Behavior:**
- Shows current result for context
- Large text input area (auto-expanding)
- Can paste images/files (drag-drop)
- Primary button: "Revise"
- Cancel button: goes back to COMPLETED
- Alt+Enter in input = Revise
- Enter (without Alt) = new line in input
- Auto-focuses input

---

### FINALIZATION Stage
```
┌────────────────────────────────────┐
│ READY TO FINALIZE                  │
│ ────────────────────────────────── │
│                                    │
│ Result accepted. What's next?      │
│                                    │
│ ┌──────────────────────────────┐   │
│ │ [💾 Save Locally]            │   │
│ │ [📝 Commit to Git]           │   │
│ │ [🚀 Push to Git]             │   │
│ │ [🌐 Deploy]                  │   │
│ │ [💬 Comment on Ticket]       │   │
│ │ [✓ Done]                     │   │
│ └──────────────────────────────┘   │
│                                    │
│ Note: Only available actions shown│
└────────────────────────────────────┘
```

**Behavior:**
- Title: "READY TO FINALIZE"
- Each action is a separate button
- Only show actions that apply to current context:
  - Save: if files were created/modified locally
  - Commit: if git repo detected and files changed
  - Push: if commits exist and push permission available
  - Deploy: if deployment script/config exists
  - Comment: if connector is enabled and ticket ID available
  - Done: always available to skip finalization
- Each button self-contained, independent
- User selects ONE (or Done to skip)
- No simultaneous multi-select

---

### FINALIZATION Substage (Commit)
```
┌────────────────────────────────────┐
│ COMMIT TO GIT                      │
│ ────────────────────────────────── │
│                                    │
│ Files to commit:                   │
│ • src/app/about/page.tsx           │
│ • src/styles/about.css             │
│                                    │
│ Commit message:                    │
│ ┌──────────────────────────────┐   │
│ │ Fix About page layout        │   │
│ │                              │   │
│ │ - Fixed grid alignment       │   │
│ │ - Improved mobile view       │   │
│ │ - Added a11y features        │   │
│ └──────────────────────────────┘   │
│                                    │
│ ────────────────────────────────── │
│                                    │
│ [Commit]             [Cancel]      │
└────────────────────────────────────┘
```

**Behavior:**
- Files listed
- Message textarea (pre-populated with summary)
- User can edit message
- Primary button: "Commit"
- Alt+Enter in message = Commit
- Cancel returns to FINALIZATION options

---

### FAILED Stage
```
┌────────────────────────────────────┐
│ ✗ FAILED                           │
│ ────────────────────────────────── │
│                                    │
│ Something went wrong.              │
│                                    │
│ Error: Python 3.11 not found       │
│ Location: step 3 (Run tests)       │
│                                    │
│ Suggestion:                        │
│ Install Python 3.11 and retry      │
│                                    │
│ ────────────────────────────────── │
│                                    │
│ [Retry]          [Revise Plan]     │
│                                    │
│                [Cancel]            │
└────────────────────────────────────┘
```

**Behavior:**
- Red X in title
- Error message (not generic "failed", actual error)
- Location in execution pipeline
- Suggestion for recovery
- Retry button: restarts from failure point (if safe)
- Revise Plan button: goes back to PLAN with context
- Cancel button: returns to IDLE
- Alt+Enter = Retry

---

### DONE Stage
```
┌────────────────────────────────────┐
│ ✓ COMPLETE                         │
│ ════════════════════════════════== │
│                                    │
│ Task completed successfully.       │
│                                    │
│ Summary:                           │
│ Edited: src/app/about/page.tsx     │
│ Committed: "Fix About page layout" │
│ Pushed: origin/feature → main      │
│                                    │
│ No further action required.        │
│                                    │
│ ════════════════════════════════== │
│                                    │
│                                    │
│ Ready for new request.             │
│                                    │
└────────────────────────────────────┘
```

**Behavior:**
- Green checkmark, large header
- Summary of actions taken
- No buttons
- Auto-transitions to IDLE after 2 seconds (optional)
- User can click elsewhere or type new request

---

## TABLE 6: TEAM/ENTERPRISE GOVERNANCE DIFFERENCES

| Aspect | Personal User | Team Member | Team Admin | Enterprise Member | Enterprise Admin |
|--------|---|---|---|---|---|
| **Can approve own plan** | Yes | Yes (for self) | Yes | Yes (for self) | Yes |
| **Can approve team member plan** | N/A | No | Yes (some permissions) | No | Yes (some permissions) |
| **Can edit team connectors** | N/A | No | Yes | No | Yes |
| **Can deploy** | Yes (personal env) | If entitled | If entitled + approved | If entitled | If entitled + approved |
| **Governance button set** | Personal | Personal (team-aware) | Personal + admin | Personal (org-aware) | Personal + admin |
| **Permission request adds reviewer** | No | No | N/A | No | Yes (for high-risk actions) |
| **ALT+ENTER same?** | Yes | Yes | Yes | Yes | Yes |

---

## TABLE 7: DEFERRED FEATURES

| Feature | Reason | Status | Planned Phase |
|---------|--------|--------|---|
| **Evidence/Screenshot in Review** | Not yet implemented in current product | DEFERRED | Post-launch |
| **Jira/Linear write-back** | OAuth scopes read-only; scope upgrade required | DEFERRED | Post-launch |
| **Meeting Assistant approval** | Meeting service incomplete | DEFERRED | Post-launch |
| **Batch approve all permissions** | Risk of bypassing governance; not in current design | DEFERRED | Post-launch |
| **Background task multi-resume** | Multiple tasks awaiting approval; current product doesn't support this | DEFERRED | Post-launch |
| **Department-level approval chains** | Enterprise feature not in current scope | DEFERRED | Post-launch |
| **Custom permission workflows** | Policy-based only; custom workflows post-launch | DEFERRED | Post-launch |
| **Complexity-based pricing UI** | Complexity billing not yet wired; pricing UI deferred | DEFERRED | Post-launch |

---

## COMPANION PANEL UI LAYOUT MAP

### Complete Flow Diagram

```
START (Chat)
    ↓
    [User types request + Send]
    ↓
THINKING
    ↓
    [Paw analyzes]
    ↓
UNDERSTANDING (Progress shown)
    ↓
    [Optional: Shows initial findings]
    ↓
PLAN
    ├─ [No approval needed]
    │   ↓
    │   [Run Plan]
    │   ↓
    │   PERMISSION_REQUEST (if action needs permission)
    │   ├─ [Allow]
    │   │   ↓
    │   │   RUNNING
    │   └─ [Deny]
    │       ↓
    │       CANCELLED
    │
    └─ [Approval needed]
        ↓
        [Approve Plan / Revise / Deny]
        ├─ [Approve]
        │   ↓
        │   PERMISSION_REQUEST (first required permission)
        │   ├─ [Allow]
        │   │   ↓
        │   │   PERMISSION_REQUEST (next permission, if any)
        │   │   └─ [Repeat for each permission]
        │   │       ↓
        │   │       RUNNING
        │   └─ [Deny]
        │       ↓
        │       CANCELLED
        │
        ├─ [Revise]
        │   ↓
        │   [Input: "What should change?"]
        │   ↓
        │   UNDERSTANDING
        │   ↓
        │   PLAN
        │
        └─ [Deny]
            ↓
            CANCELLED

RUNNING
    ├─ [Task completes successfully]
    │   ↓
    │   COMPLETED (success)
    │   ↓
    │   [Accept / Needs Changes]
    │   ├─ [Accept]
    │   │   ↓
    │   │   FINALIZATION
    │   │   ├─ [Save]
    │   │   ├─ [Commit]
    │   │   ├─ [Push]
    │   │   ├─ [Deploy]
    │   │   ├─ [Comment]
    │   │   └─ [Done]
    │   │       ↓
    │   │       DONE
    │   │
    │   └─ [Needs Changes]
    │       ↓
    │       REVIEW (input for revision)
    │       ↓
    │       UNDERSTANDING
    │       ↓
    │       [Re-analyze]
    │       ↓
    │       PLAN
    │
    ├─ [Task hits permission during execution]
    │   ↓
    │   WAITING_FOR_PERMISSION
    │   ├─ [Allow]
    │   │   ↓
    │   │   RUNNING (continues from pause point)
    │   └─ [Deny]
    │       ↓
    │       CANCELLED
    │
    ├─ [Task fails]
    │   ↓
    │   FAILED
    │   ├─ [Retry]
    │   │   ↓
    │   │   RUNNING (restart)
    │   ├─ [Revise Plan]
    │   │   ↓
    │   │   UNDERSTANDING
    │   │   ↓
    │   │   PLAN
    │   └─ [Cancel]
    │       ↓
    │       CANCELLED
    │
    └─ [User cancels]
        ↓
        CANCELLED

FINALIZATION (per option selected)
    ├─ [Save]
    │   ├─ [Save (confirm)]
    │   │   ↓
    │   │   DONE
    │   └─ [Cancel]
    │       ↓
    │       FINALIZATION (menu shown again)
    │
    ├─ [Commit]
    │   ├─ [Commit (confirm)]
    │   │   ├─ [If needs permission → PERMISSION_REQUEST]
    │   │   ├─ [If succeeds → DONE]
    │   │   └─ [If fails → FAILED]
    │   └─ [Cancel]
    │       ↓
    │       FINALIZATION (menu shown again)
    │
    ├─ [Push]
    │   ├─ [Push (confirm)]
    │   │   ├─ [If needs permission → PERMISSION_REQUEST]
    │   │   ├─ [If succeeds → DONE]
    │   │   └─ [If fails → FAILED]
    │   └─ [Cancel]
    │       ↓
    │       FINALIZATION (menu shown again)
    │
    ├─ [Deploy]
    │   ├─ [Deploy (confirm)]
    │   │   ├─ [If needs permission → PERMISSION_REQUEST]
    │   │   ├─ [If succeeds → DONE]
    │   │   └─ [If fails → FAILED]
    │   └─ [Cancel]
    │       ↓
    │       FINALIZATION (menu shown again)
    │
    ├─ [Comment]
    │   ├─ [Add Comment (confirm)]
    │   │   ├─ [If needs permission → PERMISSION_REQUEST]
    │   │   ├─ [If succeeds → DONE]
    │   │   └─ [If fails → FAILED]
    │   └─ [Don't Comment]
    │       ↓
    │       FINALIZATION (menu shown again)
    │
    └─ [Done]
        ↓
        DONE

DONE
    ↓
    [Auto-transition to IDLE after 2 seconds]
    ↓
    IDLE (Ready for new request)
```

---

## DEFERRED FEATURES SPECIFICATION

The following features are NOT in current product and should NOT be implemented for launch:

1. **Screenshot/Evidence Review** — comparison images, side-by-side diffs (Post-launch)
2. **Jira/Linear Ticket Write-Back** — update issue, add comment to external system (Post-launch, requires OAuth scope upgrade)
3. **Meeting Assistant Flow** — requires email service and additional setup (Disabled for launch)
4. **Department Approval Chains** — multi-level approval workflows (Post-launch Enterprise feature)
5. **Custom Permission Policies** — admin-defined permission rules beyond current gates (Post-launch)

---

## BUTTON VISUAL HIERARCHY

### Primary Action Button
- **Color:** Blue/Green (positive)
- **Text:** Bold, clear action (e.g., "[Allow me to Edit]", "[Approve Plan]", "[Run Plan]")
- **Focus:** Visible outline on keyboard focus
- **Size:** Larger, clickable area ≥40px height
- **Icon:** Optional (up to designer)

### Secondary Action Button
- **Color:** Gray (neutral)
- **Text:** Lighter weight (e.g., "Revise", "Cancel")
- **Focus:** Visible outline on keyboard focus
- **Size:** Similar to primary
- **Icon:** Optional

### Deny/Cancel/Rejection Button
- **Color:** Red/Orange (negative)
- **Text:** Clear rejection (e.g., "[Deny]", "[Cancel]")
- **Focus:** Visible outline
- **Size:** Similar to primary
- **Placement:** Right side of primary when both present

### Disabled Button
- **Opacity:** 50% or grayed
- **Cursor:** `not-allowed`
- **No click handler**
- **Example:** Send button when at credit limit

### Destructive Action (Deploy, Push, Commit)
- **Color:** Red or bold positive color
- **Text:** Clear action (e.g., "[Deploy]", "[Push]")
- **Confirmation required:** Two-click pattern (select action → confirm)
- **No accidental execution**

---

## KEY RULES — DO NOT MIX

| Don't Do | Why | Solution |
|----------|-----|----------|
| Show "Accept" before result exists | Result doesn't exist yet | Only show in COMPLETED stage |
| Show "Push" before "Commit" approved | Commit might fail, waste time | Sequential: Commit → Push |
| Show "Deploy" with unaccepted result | Result unvalidated | Accept first, then finalize |
| Show "Needs Changes" while RUNNING | Can't change what's executing | Only in COMPLETED stage |
| Show approval + finalization together | Too much cognitive load | Show finalization AFTER accept |
| Show 10+ permissions at once | Overwhelming | Show one focused permission per stage |
| Auto-execute after approval | User needs control | Require explicit action button |
| Alt+Enter for destructive without focus | Accidental action | Only approve focused button |

---

## SUMMARY

### Current Features in Spec
- ✓ Chat input & send
- ✓ Plan approval/revision/denial
- ✓ Permission requests
- ✓ Execution with progress
- ✓ Pause for approval during execution
- ✓ Result review (Accept/Needs Changes)
- ✓ Finalization (Save/Commit/Push/Deploy/Comment)
- ✓ Error handling & retry
- ✓ Keyboard shortcuts (Alt+Enter, Esc, Tab)

### Deferred (Post-Launch)
- ○ Evidence/screenshot comparison
- ○ Jira/Linear write-back
- ○ Custom approval workflows
- ○ Meeting Assistant
- ○ Department-level approvals

### Button Count Summary
- **Primary action buttons:** 15-20 (permission allows, plan approve, run, accept, finalize options)
- **Secondary buttons:** 10-15 (deny, revise, cancel, needs changes)
- **Total in spec:** ~30-35 unique button types across all stages
- **Never shown together:** 10+ rule (never >3 buttons in one view)

### Keyboard Rules Summary
- **Alt+Enter:** Approve currently focused button only
- **Escape:** Cancel current stage
- **Enter:** Submit input (in textarea), NOT approve
- **Tab/Shift+Tab:** Navigate between buttons
- **No silent shortcuts:** Every action requires focus + interaction

---

**END OF SPECIFICATION**

**STATUS:** Ready for UI/UX implementation approval.

**DO NOT CODE COMPONENTS YET.** 

Await approval of this button matrix and layout spec before implementing React components.

