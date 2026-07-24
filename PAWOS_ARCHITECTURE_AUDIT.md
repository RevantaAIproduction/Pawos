# PawOS Architecture Audit

**Status: COMPLETE.** Assembled from direct codebase research (firsthand knowledge of the Team & Enterprise platform this session built, plus five parallel research passes over every other runtime). Every claim below traces to a specific file path. Nothing in this document authorizes or reflects any code change — this is read-only analysis per explicit instruction. **Awaiting approval before any architectural or implementation change proceeds.**

Scope note: this audit covers the Electron desktop app (`src/`), the Supabase-backed Team & Enterprise collaboration layer (`supabase/migrations/`), and the marketing/checkout website (`pawos-web/`). It does not cover a mobile app (none exists — reserved hooks only, see Companion section).

---

## 0. How to read this document

Each runtime/subsystem section answers, where applicable: **Purpose, Inputs/Outputs, Real vs. stub, Individual/Team/Enterprise use, Security model, Failure modes, Scalability, Confusion/duplication found.** Opinions and recommendations are marked **Verdict:** and **Recommendation:** — everything else is a fact traced to a file path.

---

## 1. Team & Enterprise Collaboration Platform (Phases 0–6) — audited firsthand

*This section is written from direct knowledge — I designed, built, and verified Phases 0 through 6 of this system in this and prior sessions. File paths and behavior below are current as of this audit.*

### 1.1 Foundations (Phase 0) — `supabase/migrations/20260721000500_phase0_rbac_workspaces_audit.sql`

**Purpose:** the permission/audit substrate every later collaboration feature depends on.

**What's real:**
- `role_capabilities(organization_id, role, capability, allowed)` — a sparse, data-driven permission matrix (absence of a row = not granted). `has_capability(org_id, capability)` is a `security definer` Postgres function every RLS policy in the platform calls; it short-circuits `true` for the org owner unconditionally.
- `organization_policies(organization_id, policy_key, policy_value jsonb)` — generic key/value governance store. As of Phase 0 this had **zero real consumers** (no UI wrote to it, nothing read it for enforcement) until Phase 6 added the first two real uses (require-approval policy, SSO config).
- `audit_log` — one append-only table, written exclusively by a generic `log_audit_event()` trigger attached per-table (never client-side inserts). Every subsequent phase's new tables get this same trigger rather than inventing their own log.
- `organization_workspaces` — the workspace container every later phase's data hangs off.

**Verdict:** solid, minimal foundation. The capability-table approach (vs. hardcoded role switches) is the right call for a platform that needs org-customizable roles later — it's already paying for itself (Phase 6 added 3 new capabilities with zero schema changes).

### 1.2 Shared data, async (Phase 1) — `20260721000600_phase1_org_shared_data.sql`

Communication Runtime org-scoping, `workspace_projects`, `organization_companions` (opt-in), org CRM (contacts/companies made org-visible), `organization_credit_pools`. Renderer services follow a consistent **direct-Supabase pattern** (no IPC hop) — `OrganizationService.ts`, `PermissionService.ts` — since org data is inherently cloud-backed like auth itself.

**Verdict:** directly fixes the single biggest gap an audit of the pre-Phase-0 product would have found: *"Team tier gave a teammate nothing a solo user didn't already have."* Post-Phase-1, a contact/company/project genuinely becomes org-visible.

### 1.3 Oversight (Phase 2) — `20260721000800_phase2_activity_assignment_temp_permissions.sql`

Work assignment (`workspace_tasks`), Activity Dashboard, and **temporary permissions** (`organization_temp_grants` + a scheduled `pg_cron` sweeper that auto-revokes on expiry, itself audit-logged both on grant and on auto-revoke).

**Verdict:** temp-grants-with-auto-expiry is a genuine enterprise-grade primitive (e.g., "Admin for one hour"). Real, not cosmetic.

### 1.4 Git & deployment collaboration (Phase 3) — `20260721000900_phase3_git_deployment_collaboration.sql`

**Explicitly and honestly scoped** — the migration's own header states: *"this phase does not introduce an org-scoped credential vault (that is a larger, not-yet-scheduled commitment)... Actually executing a deploy still goes through the existing local, confirmation-gated deployProject action; a deployment-type task is a shared record of intent/assignment/status, not a remote trigger for another member's machine."*

This is the single most load-bearing architectural constraint in the whole collaboration platform: **deploy/rollback/promote execute locally, on whoever's machine ran them, always.** There is no concept of "trigger a deploy on a teammate's behalf" or a shared execution runner. `organization_repositories` and `branch_ownership` are **advisory** records (who owns what, for humans to read), not enforcement.

**Verdict:** this constraint is sound for a desktop-first product but is the direct reason "distributed engineering across multiple developers/multiple PawOS instances" (see §9) does not exist as a real capability today — it's a single-player execution model with shared *visibility*, not shared *execution*.

### 1.5 Presence & live collaboration (Phase 4)

No new migration — deliberately Supabase-native (Realtime presence channels + broadcast for cursors, Yjs CRDT for shared editing over the same broadcast channel). This is the cheapest phase in the roadmap by design (per the roadmap doc: "cheap, Supabase-native").

### 1.6 Remote Assistance, Screen Sharing, Remote Control (Phase 5) — `20260721001000_phase5_remote_assistance_control.sql`

**The highest-security-surface phase**, and the most heavily verified (three genuine defects found and fixed across three independent verification passes before approval — see `TEAM_ENTERPRISE_IMPLEMENTATION_LOG.md` for the full incident history). Real state machine: Requested → Notified → Joined → per-capability grant/revoke (view screen, view runtime, move cursor, click UI, keyboard, clipboard, file editing, terminal, browser control, infra control) → Completed → AuditLogged. Every transition is audit-logged. `control_grants` table + live Realtime subscription is the "instant revoke" mechanism — a client-side subscription immediately stops honoring further remote input on revoke, no polling delay.

**Known limitation, disclosed in the log:** screen sharing/shared terminal/instant-revoke depend on Supabase Realtime's broadcast-channel delivery, which was observed to be **intermittently unreliable at the service layer** during verification — an external condition, not a code defect, and not something this codebase can fix (it's Supabase's infrastructure). This is a real production risk worth naming: **if Supabase Realtime has a bad day, Remote Assistance's live features degrade with it**, and there's no fallback transport (e.g., no WebRTC-only signaling path that doesn't also depend on the same broadcast channel for the initial handshake).

### 1.7 Enterprise Hardening (Phase 6) — `20260722000000_phase6_enterprise_hardening.sql` — **not yet approved, frozen pending user sign-off**

Built this session: org-scoped credential vault (`organization_credentials`, `pgcrypto`-encrypted, decrypt gated on org membership not just admin — deliberately, since the whole point is shared usability), a generalized approval-request workflow (`organization_approval_requests`, modeling Phase 5's state machine onto *any* gated capability), SSO config card (honestly scoped — real SAML/OIDC enablement is a one-time Supabase-project-level configuration step this app cannot perform itself), and CSV/search/filter on the audit log.

**Verdict on Phase 6 specifically:** implementation is typecheck-clean, all three bundles rebuilt clean, migration applied to the live project. Live UI verification is still pending (see implementation log) — do not treat Phase 6 as production-verified until that closes out.

### 1.8 RBAC role reality check

Team tier roles: `owner / billingAdministrator / workspaceAdministrator / member`. Enterprise tier roles: `organizationOwner / organizationAdministrator / itAdministrator / securityAdministrator / billingAdministrator / departmentManager / member`.

**Confirmed by reading the Phase 0 seed function directly:** `itAdministrator` and `securityAdministrator` are seeded with **zero capabilities** — the migration's own comment says so explicitly: *"itAdministrator/securityAdministrator get nothing yet — their real capabilities are infrastructure/security-runtime-specific and those runtimes aren't organization-aware until a later phase; an empty grant set for them now is honest, not a bug."*

**Verdict:** this is honestly disclosed technical debt, not a hidden gap — but it means **today, an Enterprise org that assigns someone `itAdministrator` or `securityAdministrator` gets a role label with no actual permissions attached.** That's a real product gap for any Enterprise buyer evaluating the role model literally. See §11 (Enterprise audit) recommendation.

### 1.9 Governance/approval workflow — architectural tension worth flagging

Two separate "approval" concepts now coexist by design:
1. **`PendingApprovalStore`** (`src/main/infrastructure/PendingApprovalStore.ts`) — local, in-memory, single-device, single-user. Gates a *local* user's own destructive infra action (confirm-then-retry). Exists since the original Infrastructure Runtime build.
2. **`organization_approval_requests`** (Phase 6) — org-level, cross-user, Supabase-backed. Gates the same class of action (deploy/rollback/promote) when a governance policy demands a *second person's* sign-off.

They're wired to coexist correctly (Phase 6's `GovernanceGate.ts` wraps the action dispatch *before* it ever reaches `PendingApprovalStore`'s local gate), but this is **two different approval systems with overlapping vocabulary** ("approval," "pending," "decide") that a new engineer on this codebase would very plausibly confuse. See §14 (recommendations).

---

## 2. Core AI loop — Conversation / Reasoning / Planning / Memory Runtimes

### 2.1 Conversation Runtime

**Purpose:** `ConversationRuntime.ts` (1563 lines) is a single explicit state machine owning the whole turn lifecycle: mic/typed input → STT → reasoning → tool-call execution → TTS → idle. Its own doc comment: "Every subsystem reports into this one runtime; nothing outside it decides what the conversation is doing." One instance per companion overlay; `turnId` is bumped on every interrupt so stale async callbacks are dropped.

**States:** `idle | listening | transcribing | thinking | performingAction | speaking | interrupted | completed | error | waitingForPermission`, with an explicit `INTERRUPTIBLE_STATES` set governing when new input barges in.

**Real, fully wired end-to-end:** streaming TTS with sentence-chunking (Paw "talks while thinking"), barge-in, a tool-call continuation loop capped at `MAX_TOOL_ITERATIONS_PER_TURN` (10) with a genuine **Recovery Policy** — 3 repeated identical failures triggers a system message telling the model to stop retrying and ask the user instead of looping forever — and a documented, previously-real race-condition fix (`drainPendingActionsAndFinalize`) so a chained tool call can't finalize the turn out from under itself. Actual OS effects are serialized through `ExecutionQueue`/`ExecutionSupervisor`, deliberately kept dumb: the queue only guarantees ordering, the supervisor only accumulates a deterministic `ExecutionRecord` per request for "Work History" — neither ever calls the model or decides what runs next.

**Confirmation replay is deliberately not re-trusted to the model** — a refused destructive action is remembered as `pendingConfirmation`, and a later "yes" replays the *original* stored request via `executeConfirmedAction` rather than letting the model re-invoke the tool from scratch.

**Gap found:** Electron's built-in speech recognition (`webkitSpeechRecognition`) is confirmed **not functional in Electron** (no baked-in Google API key) — STT is genuinely routed through Gemini transcription of recorded audio instead. This is a real, working workaround, correctly documented, not a silent failure — but worth naming since "browser speech APIs" is an easy thing for a new contributor to assume works.

### 2.2 Reasoning Runtime

**Real, genuine provider abstraction** — `ReasoningProvider` is a small interface; `ReasoningRuntime` is fully provider-agnostic (owns history, system prompt, tools, turn cancellation); `AIRouter.ts` is the sole entry point UI code touches. **5 real providers implemented** with actual HTTP streaming: OpenAI, Anthropic, Gemini, Ollama, and one shared OpenAI-compatible shim powering both LM Studio and OpenRouter (7 catalog entries total). `LocalReasoningProvider` is an honest, clearly-labeled non-LLM fallback (rule-based canned replies) used only when nothing is configured.

**System prompt** (`systemPrompt.ts`, ~87 lines) is one large template covering, in order: identity/tool framing → an explicit internal Understand→Plan→Prepare→Execute→Observe→Verify→Recover→Continue→Summarize lifecycle → anti-hallucination rule → confirmation/goal-ownership → Coding Intelligence + Go/Pro refusal messaging → Project/Coding Memory, Live Diff/TODO, Browser Preview → bounded auto-fix loop → Minimal Change Philosophy → Browser Intelligence → Comparison/Research → auth-state handling → Requirement/Design/Creative Intelligence (infer, never interrogate) → Visual Verification → Communication Intelligence (consent-gated) → Relationship Intelligence → Meeting Follow-up → Infrastructure Runtime (deploy/rollback/promote) → Enterprise Ticket Intelligence/Autonomous Engineering Loop (explicitly never-certain) → Git Collaboration → Infra mode → Email Follow-up (explicitly: Paw never sends an email itself, only opens a prefilled compose window) → Office Intelligence (explicitly admits it can't add a chart to a spreadsheet and says so) → Companion Memory. **The prompt itself states: "No new orchestration engine backs this — the model still does 100% of the planning; this just tells it how."** This single sentence is the load-bearing fact for §3 (Planning) below.

### 2.3 Planning/Intent

**164 distinct tools** registered in `IntentRegistry.ts` (2925 lines), each with a JSON-schema parameter block; a large switch statement (`toolCallToActionRequest`) maps each tool call into a typed `ActionRequest` — the explicit "AI decides WHAT, PawOS decides HOW" boundary stated in the file's own header.

**There is no separate planning/orchestration module — confirmed, not inferred.** Planning is implicit in the LLM's own function-calling loop, per the system prompt's own admission quoted above. The only "planning" artifacts are the model *voluntarily* persisting its own plan state via ordinary tool calls (`set_task_checklist` for live TODO, `checkpoint_research` for long-running research) — not an independent planner. `AIRouter.ts` additionally does one non-obvious job: `classifySessionContinuation` always calls Gemini specifically (regardless of the user's active chat provider) to decide which prior conversation a new message continues.

**Verdict:** clean, no architectural confusion here — "planning" language is scattered across several places (system prompt, `set_task_checklist`, `ExecutionSupervisor`'s Work History) without ever cohering into one named Planner, but this reads as an intentional simplicity choice, not an accidental gap.

### 2.4 Memory Runtime — real duplication found, but self-aware duplication

Memory is **split between one unified generic graph and five-plus ad hoc flat-file stores.**

**The unified system:** `MemoryGraphStore.ts` — a generic, provenance-tracked entity/relation graph (`memory-graph.json`), where every entity carries version history (created/modified/renamed/moved/deleted/restored, never hard-deleted) and every edge is append-only (superseded via `active:false`, never deleted). Its own comment: "every future runtime... writes into this exact same store through its own typed wrapper, never by touching this file." Confirmed consumers via typed wrapper modules: files/workspaces, coding projects/tasks, **"Infrastructure Awareness"** (repositories, services, deployments, incidents, secrets *name-only*, env vars *name-only*), **"Office Memory"** (metadata-only, deliberately reuses the Infrastructure wrapper's `project` entity rather than duplicating identity), Companion Memory (goals/routines), and Browser Intelligence's comparison/research memory. A shared `relationVocabulary.ts` centralizes relation names so runtimes don't invent synonyms.

**Standalone flat-JSON stores that do NOT sit on `MemoryGraphStore`** (each hand-rolls the identical singleton/JSON-in-userData/load-save pattern independently): `WorkspaceMemoryStore` (recent project context), `ExecutionMemoryStore` (500-cap Work History log), `ErrorMemoryStore` (500-cap past-fix memory, deliberately simple substring-overlap scoring instead of embeddings — "a real, explainable signal rather than a black-box similarity score"), `EngineeringMemoryStore` (1000-cap deploy/incident log, explicitly "Infrastructure Runtime's own equivalent of ExecutionMemoryStore"), `CommunicationMemoryStore` (contacts.db/companies.db), plus separate `CommunicationSessionStore`/`CommunicationIntelligenceStore`/`CommunicationSearchIndexStore`/`CommunicationTimelineStore` and `ConversationSessionStore`.

**Verdict:** this is **architecturally honest, self-aware duplication, not accidental duplication** — nearly every one of these files' own comments explicitly states what it is *not* duplicating and cross-references the sibling store it parallels. But it still means there are, in effect, **two parallel memory systems** (one graph, one pile of flat logs), and a new engineer has no single place to look — they must already know which of ~11 stores holds a given fact. See §14 for a concrted recommendation.

### 2.5 Automation/Action Engine — confirmed identical to the Desktop Execution Engine covered next

Plugin-count reconciled across both research passes: **~170 registered plugin instances drawn from ~188 plugin files.** Confirmed: `DesktopExecutionEngine` *is* the Automation Runtime — "Automation Runtime," "Desktop Execution Engine," and "Action Engine" all refer to the same class across different comments in the codebase; there is no separate, differently-named orchestration layer above it. Full plugin catalog and recovery-loop mechanics are detailed in §3.2 below rather than repeated here.

## 3. Coding Runtime, Desktop Execution Engine, Infrastructure/Deployment Runtime

### 3.1 Coding Runtime / "Coding Canvas"

**Purpose:** a coding-task-specific visual surface layered on the runtime-agnostic `WorkspaceRuntime` shell, plus a local Go/Pro capability toggle gating code execution.

**Files:** `src/renderer/workspace/WorkspaceRuntime.tsx`, `WorkspaceTypes.ts`, `src/main/execution/CodingModeStore.ts`, `GetCodingModePlugin.ts`/`SetCodingModePlugin.ts`, `src/renderer/conversation/systemPrompt.ts`.

**Real vs. placeholder:** `WorkspaceRuntime.tsx` detects a coding task by action shape and renders 10 Coding Canvas sections (not ~12 as originally recalled): `projectUnderstanding`, `todoProgress`, `runningProcesses`, `terminalOutput`, `codeDiff`, `buildStatus`, `testResults`, `browserConsole`, `errorTimeline`, `codingMemory`. All but one are wired to real data (`BuildProjectPlugin`, `TestResultParser`, `GitDiffStatPlugin`, `ProcessManager`). **`codingMemory` is a confirmed honest placeholder** — it always renders static copy ("Ask me what I remember...") with no backing query, despite being listed as a real region.

**The Go/Pro gate is real and centrally enforced — and is a genuine naming collision, not just a cosmetic one.** `CodingModeStore.ts`'s own comment: "not a purchased plan, not billing, not an entitlement check." It's a local JSON preference (`coding-mode.json`), enforced in `DesktopExecutionEngine.execute()`: any `CODING_EXECUTION_ACTION_TYPES` request (`writeFile`, `deletePath`, git write ops, `runCommand`, `startProcess`, `buildProject`, `devBrowserPreview`) is hard-refused with `reason: 'coding-mode-restricted'` while in `'go'` mode — enforced at the engine layer, not UI-hidden. **But the actual paid subscription tiers use the identical strings** (`go`/`pro`/`proMax`/`team`/`enterprise` in `EntitlementService.ts`). The codebase's own help article (`development.ts`) has to explicitly warn users these are unrelated axes: "Paw Go and Paw Pro here describe what Paw is allowed to do on your machine, not what you paid for." **Verdict:** correct separation of concerns in code, but a real UX/support-burden risk from the name collision (see §14).

**Integrations:** git read/write (real, via `runGit.ts`-backed plugins), build/test (real, parses Jest/Vitest/pytest/mocha output, honestly falls back to exit-code-only rather than fabricating numbers), browser preview (real, `DevBrowserManager`), TODO tracking (real but session-only, no persistence). The "automatic build/run/test/fix loop" is **not an enforced code mechanism** — it's system-prompt-level LLM guidance ("up to 3 attempts"), unlike `DesktopExecutionEngine`'s actual `MAX_RECOVERY_ATTEMPTS` code gate.

### 3.2 Desktop Execution Engine

**Purpose:** the single dispatch/lifecycle engine for every desktop-affecting action across every runtime.

**Plugin catalog:** ~175 plugins registered in one flat array (`DesktopExecutionEngine.ts`) spanning file/path ops, process management, git, software install/detect, ~25 browser-automation plugins, dev-browser tools, 17 infrastructure plugins, 7 office plugins, plus communication/companion plugins and a catch-all `notImplementedPlugin`. **No separate `ExecutionQueue`/`ExecutionSupervisor` exists in the main process** (confirmed by direct search) — only `ExecutionMemoryStore.ts`, which is a log, not a queue.

**Recovery — real, centrally enforced, not duplicated per-plugin.** `BasePlugin.ts` defines default no-op `requirements()/prepare()/observe()/verify()/recover()`; individual plugins override only what's genuinely real for them (e.g. `DeployProjectPlugin.verify()` does a real HTTP health check; its `recover()` does a real automatic rollback). `DesktopExecutionEngine.execute()` runs: mode gate → destructive-confirmation gate → prepare → execute → observe → verify → a **bounded** recovery loop (max 3 attempts) that re-verifies after each `recover()` and stops honestly rather than looping forever.

**Scalability — confirmed single-user, single-active-task, no concurrency model.** `execute()` is one async call with no request queue, no concurrency limiter, no per-workspace locking. `ProcessManager` caps tracked processes at 50 via a simple in-memory `Map`. **There is no multi-repo/multi-workspace orchestration concept anywhere in the main process** — this directly substantiates §8's finding that the architecture cannot support "50-100 tickets/day" or genuinely parallel multi-developer execution without new orchestration being built from scratch.

### 3.3 Infrastructure Runtime

**Purpose:** read-first DevOps/SRE layer — connector registry, mode gate, approval queue, engineering memory, root-cause/investigation tooling.

**Real connectors and auth (all env-var based today, confirmed):** GitHub (`GITHUB_TOKEN`), GitLab, Linear, Jira, Vercel (real REST + `npx vercel` CLI shellout for deploy), Netlify (real REST + `npx netlify-cli`), and CLI-*detect-only* probes for AWS/GCP/Azure/Docker/Kubernetes (e.g. `aws sts get-caller-identity`) — real operations against those five defer entirely to the user's own authenticated CLI via `RunCommandPlugin`, there is no SDK wrapper.

**Investigation tooling is genuinely real, not theater.** `InvestigateTicketPlugin`/`InvestigateProductionIssuePlugin` share `investigationCore.ts`, which does real project analysis, real git log inspection, a real HTTP health check, real browser console/network inspection via `DevBrowserManager`, and correlation via a small **deterministic rule engine** (`rootCauseEngine.ts`, not ML) that caps its own confidence at "medium" and honestly reports "no strong signal" when nothing correlates — it does not fabricate certainty.

**Pre-Phase-6 approval layer, confirmed:** `InfraModeStore` gates `deployProject`/`rollbackDeployment`/`promoteDeployment` behind an `'investigate'` (default) vs `'full'` local toggle — same pattern as the Coding Runtime's Go/Pro gate. Separately, `PendingApprovalStore` (in-memory, no persistence across restarts) implements local confirm-then-retry, explicitly documented in its own code comment as "an honest, single-user Approval Queue — not a fabricated multi-user RBAC system." Phase 6's org-scoped credential vault and governance approval-request workflow (§1.7, §1.9) sit cleanly on top of this exact layer via `connector.setToken()` seams — confirmed additive, not a rewrite.

### 3.4 Deployment / Git collaboration — the real build/test/deploy boundary

**Only Vercel and Netlify have a real, fully-wired deploy path today.** AWS/GCP/Azure/Docker/K8s have detection only, no deploy plugin.

**The precise boundary the audit needed to clarify:** `DeployProjectPlugin` does **not** run a build or test step before deploying — it only defers to the project's own `scripts.deploy` if present, or calls the hosting connector directly. Its only real automated safety net is **post-deploy**: a genuine HTTP health check in `verify()`, and on failure, a genuine automatic rollback to the previous recorded deployment in `recover()` — both scoped to the single already-confirmed action. The "automatic build/run/test/fix loop" is **Coding Canvas / Paw Pro only**, and even there it's system-prompt guidance telling the model to validate before suggesting a deploy — not a code-enforced gate the way the mode-restriction checks are. **There is no pre-deploy test gate in code anywhere in the Infrastructure Runtime.**

**AI PR review is real** (`AiReviewPullRequestPlugin` — real diff fetch, real Gemini call for structured review, posts only on explicit confirmation, logged to `EngineeringMemoryStore`).

**Multi-repo exists only as a data concept** (`DiscoverInfrastructurePlugin` registers multiple repos as entities across every configured connector) — there is no per-repo isolation, concurrent task handling, or multi-developer execution workflow, consistent with §3.2's single-active-task finding.

## 4. Browser Runtime, Communication Runtime, Office Runtime

### 4.1 Browser Runtime

**Real, genuinely automated** — `ChromiumCdpAdapter.ts` is a real CDP-over-WebSocket client (raw `ws`, no Puppeteer/Playwright), driving real navigation, DOM query/click/fill, file-input injection, screenshots, PDF printing, cookie/network/console capture, and download interception against real spawned Chrome/Edge/Brave processes. Supports two honestly-differentiated profile modes: an isolated automation profile (default) and "reuse my real browser session" — including a documented real-world finding that heavily-hardened enterprise Chrome profiles can outright block CDP, persisted as `working`/`blocked` rather than guessed.

`BrowserRuntime.ts` is a clean facade with capability-gating (fails honestly — "X automation doesn't support Y yet" — rather than silently no-opping). **Cleanly separated from `DevBrowserManager`**, a distinct, hard-restricted (localhost/deployment-URL-only) CDP session used only for app-preview workflows — a deliberate, documented security boundary, not confusion.

**Long-Running Research and Comparison Workflow are both real, not aspirational:** research tasks persist pause/resume state in the memory graph across turns/sessions; the comparison workflow opens one isolated session per candidate URL, extracts structured data, closes every tab regardless of outcome, and deliberately never ranks/recommends itself — leaves that to the model.

**No distinct "Search Runtime" exists** — `SearchWebPlugin` is a thin wrapper that navigates to a fixed DuckDuckGo HTML endpoint and scrapes the DOM. Web search is fully folded into Browser Runtime.

**Structural inconsistency confirmed:** Browser Runtime has **no `*ConnectorRegistry`** at all, unlike Communication/Office/Infrastructure — it uses a flat `Record<BrowserId, BrowserAdapter>` instead. Defensible (only one connector *kind* exists — browser engines) but a real naming/discoverability inconsistency for anyone learning the codebase by convention.

### 4.2 Communication Runtime

**The most mature and most honestly self-documented of the three** — it ships with its own architecture doc (`COMMUNICATION_INTELLIGENCE_RUNTIME.md`) whose own "Explicitly Deferred" section matches the code exactly, no drift.

**Real:** desktop audio capture (genuine `getUserMedia`+`getDisplayMedia`+`MediaRecorder`), meeting-window detection (polls for a real running Zoom/Teams/Webex/Meet process/window every 4s), transcription (genuine Gemini call with structured speaker-tagged output, not fabricated), and contact/company/session persistence to disk.

**Confirmed honest placeholders, exactly as suspected:** phone-call capture (`MobileCompanionPhoneCallAdapter`) has real session-lifecycle scaffolding but **no mobile companion app exists anywhere in this repo** — the architecture doc itself scopes the mobile client out. Meeting-participant "bot join" adapters check for real vendor SDK credentials that are never configured anywhere in the project, so they're registered but never actually invoked — desktop capture is the only mode that ever really runs.

**Org-sharing is real, but manual and single-runtime.** `OrgSyncBridge.ts` → `CrmService.ts` → Supabase lets a user explicitly share individual contacts/companies/meeting summaries/follow-ups into an org workspace, wired to a real `CrmCard.tsx` UI — but it's a one-record-at-a-time bridge the user triggers, "nothing here runs automatically or in the background" (the runtime's own comment).

### 4.3 Office Runtime

**Real, local-file-only:** genuine `.xlsx` creation (SheetJS, honestly notes it can't write charts and never claims to), genuine `.pptx` creation with real rendered charts (`pptxgenjs`), and genuine format-aware document readers (PDF/DOCX/XLSX/CSV/XML/PPTX/image-metadata) — no fabricated parsing.

**A real, well-typed `OfficeConnectorRegistry` exists but is confirmed completely unpopulated** — zero call sites anywhere in the codebase ever call `.register()` on it, despite defining a full interface shape for Google Drive/Docs/Sheets/Slides, Microsoft 365, and iCloud connectors. Local file plugins bypass this registry entirely, working directly against the filesystem. This is the clearest "designed-but-dead abstraction" found in this audit: the registry class is real code, sitting unused, next to plugins that solved the actual problem a different way. The system prompt and Help Center both correctly and honestly disclose that no cloud Office connector exists yet.

### 4.4 Cross-cutting findings

**Connector registry pattern:** Communication/Office/Infrastructure are structurally near-identical (`{[kind]: Map<id, Adapter>}`, with doc comments explicitly cross-referencing each other as "direct siblings") — a genuinely deliberate, consistent pattern. Browser Runtime is the one outlier (§4.1), and a fourth registry (`AvatarGenerationConnectorRegistry`, Companion domain) reuses the same naming convention outside these three runtimes.

**Org-sharing is a Communication-Runtime-only capability today, not a platform-wide primitive.** No equivalent bridge exists for Office (generated documents stay purely local) or Browser Runtime (research/browsing history stays purely local) — confirmed by direct search for `organizationId`/`shareTo`/CRM references in both. Anyone building org-visibility for Office or Browser Runtime data would have to invent the `OrgSyncBridge` pattern again from scratch; there's no shared "make X org-visible" abstraction other runtimes can plug into.

## 5. Companion Runtime, Onboarding, Dashboard/Settings UX

### 5.1 Companion Runtime

**Confirmed: the 3D stack is the sole authoritative renderer**, stated directly in code: *"the 3D stack... is now the sole rendered companion. The legacy 2D controller below is kept only as a dormant compatibility layer... never mounted."* The legacy 2D `CompanionCanvas` component still exists as a file but is never imported anywhere live.

**Customization is real:** 5 personality presets each mapping to real trait lists and real system-prompt addenda; voice speed genuinely applied for browser/OpenAI providers (**honestly ignored** for elevenlabs/azure/kokoro/piper — a real, disclosed gap, not silently broken); memory on/off toggle gating two real tool calls; skins as data-only cosmetic overlays.

**Companion Package (.paw) — real local export/import, confirmed no marketplace.** Real zip bundling of config/voice/personality/memory/model/thumbnail, wired end-to-end. `CompanionGallerySourceRegistry` explicitly states *"Zero sources are registered today... no cloud/marketplace backend is implemented yet"* — the Gallery UI's "Community"/"Marketplace" sections only render if a source is registered, and none is.

**AI avatar generation from photo — confirmed explicitly rejected, not merely unbuilt.** The code states verbatim: *"Confirmed by the user: no image-generation model (Nano Banana or otherwise) can produce a 3D mesh, so Companion Studio's canonical avatar path is upload-based only."* Zero registered generation connectors, "none are planned." Companion Studio is upload-only (GLB/GLTF/VRM/FBX/OBJ) with auto-rigging.

**UX split, by design, across two surfaces:** Companion Studio's per-profile editor (personality/voice/behavior/memory/appearance) vs. Settings → Preferences (global toggles only — master volume, reaction toggles — that explicitly deep-link back to Companion Studio for per-companion settings). Cross-referenced correctly in code, but still requires a user to know two different top-level places exist to fully configure one companion.

### 5.2 Onboarding

**Real, 15-step, genuinely resumable** (main-process `OnboardingStore` persists current step; quitting mid-wizard resumes correctly). Covers: welcome → plan tier → AI model choice → privacy framing → real permission requests (mic/notifications/files, genuine `getUserMedia`/`Notification.requestPermission` calls, not simulated) → workspace folder → meet-your-companion → optional mobile-pairing QR (**explicitly commented "no mobile app exists yet"** — the QR/pairing code is real, there's just nothing on the other end) → text-only tour → finish.

**Critical finding: zero organization/Team/Enterprise onboarding path exists.** Confirmed by direct search — no organization/invite/enterprise references anywhere in the Onboarding directory, despite a fully-built org platform existing elsewhere. **Every user is onboarded as an individual regardless of which tier they pick during onboarding.** A brand-new Enterprise customer's very first-run experience never once mentions organizations, invites, or teammates.

**Landing spot after onboarding:** always the Dashboard home, which is honestly empty for a new user ("No activity yet — enable your companion and ask it to do something to start building a history"). No guided first task, template gallery, or example prompt — the "first five minutes" experience is essentially just a spoken welcome message, then silence.

### 5.3 Dashboard navigation & Settings

**Sidebar (confirmed current, real):** Primary — Home, Talk with Paw, Companion Studio, Projects, Apps, Analytics. Secondary — Work History, Conversation History. Footer — `ProfileMenu` (Settings/Language/Help/Upgrade/Log out). **Settings and Upgrade are not sidebar items** — reachable only through the profile popover or in-context deep links.

**Settings — confirmed exactly 9 flat tabs**, all wired to real components: Account, Devices, Preferences, AI, Privacy, Security, Browser Tools, Billing, Developers. **A real, easy-to-miss two-level hierarchy exists**: Preferences has its own internal 5-tab sub-nav (General/Theme/Appearance/Voice/Notifications), described in its own code comment as mirroring Settings' own top-level pattern — i.e., there's a settings-page-inside-a-settings-tab, adding navigation depth a first-time user won't expect.

### 5.4 Cross-runtime UX coherence — the most significant structural finding of this whole audit

**The Apps hub genuinely and coherently unifies runtime entry points** — Development/Research/Communication/Office/Cloud/Files tiles each route to their own runtime landing section. A 7th "Automation" tile is present but honestly disabled/greyed ("Not available yet") rather than silently linking to nothing.

**"What should I work on" is scattered across four separate views of the same underlying data**, not unified: Home's "Recent activity," the dedicated Work History page, Conversation History, and Projects (which itself admits in its own comment *"No project-tracking backend exists yet... grouping the real file paths PawOS has already touched"*) all independently derive overlapping views from the same `ExecutionRecord` log rather than presenting one canonical activity surface.

**The single most important finding in this entire audit:** `ProfileMenu.tsx` — the account/identity surface every user sees constantly — **has zero concept of organizations or multiple identities.** It shows only name/tier/guest-flag/settings/logout. Meanwhile, a substantial, genuinely-built Team & Enterprise collaboration platform exists (real organization creation, domain-restricted invites, 4-to-7-role RBAC, credit pools, CRM, audit logs, governance policies, SSO settings, a credential vault — everything documented in §1 of this audit) — **but it is surfaced nowhere except as one card buried inside the Account tab of Settings.** It has no onboarding path (§5.2), no sidebar presence, no mention in `ProfileMenu`, and the org data model itself assumes exactly one organization per user with no switcher UI at all (`getMyOrganizations()` is always indexed `[0]`).

**Verdict:** PawOS has built an entire second product (org/Team/Enterprise collaboration) with no discovery path for the persona it exists to serve. A founder evaluating "is this ready for my 20-person agency" would have to already know to dig into Settings → Account to find out the product even has a Team tier's worth of real functionality. This is the single highest-leverage UX fix available in the whole codebase — see §14/§15.

## 6. Billing/Entitlements/Tiers, pawos-web website

### 6.1 Tier ladder — real differentiation is thinner than the tier list implies

Confirmed tiers (`BillingTypes.ts`): Go (free) → Pro ($20/mo) → Pro Max ($100/mo) → Team ($20/seat) → Enterprise ($100/seat). **Pro and Pro Max are code-identical** — `PRO_MAX_FEATURES = [...PRO_FEATURES]`, same models, same features, same uncapped credit limit. Marketing copy on both the desktop app and the website claims Pro Max gets "higher usage limits" and "priority access to new models" — **neither claim is backed by any code today.** Team/Enterprise get the same AI models as Pro; their entire differentiation is organizational (seats, workspaces, admin controls), not AI capability — which is a defensible product choice, but the *specific* Pro-vs-Pro-Max claim is not.

**Guest mode's "no entitlements" framing is a UI convention, not an enforced state.** There is no `'guest'` value in the tier type at all, and `SubscriptionStore` is a single un-namespaced global JSON file defaulting to `{tier:'go', status:'none'}` — a guest session's actual entitlements are whatever the last locally-set tier happens to be, not a deliberately-zeroed code path. The UI compensates cosmetically (special-cased "No plan yet" copy for `user.isGuest`), which is honest at the copy layer but not architecturally enforced.

**PricingConfigStore's `update()` is confirmed dead code** ("not wired to any UI yet") — pricing is always regenerated from source, never actually edited at runtime despite the store existing.

### 6.2 Entitlement Service — genuinely centralized for AI capability, mostly enforcing no-ops today

Confirmed no bypass: every tier/feature check for AI capability routes through `EntitlementService` via IPC; the only `tier ===`-shaped checks found elsewhere are a *different*, pre-existing concept — the local Coding Runtime Go/Pro toggle (§3.1), not account tier, and UI-only role-label branching in `OrganizationSection.tsx`.

**But most of what's centralized is currently inert:** `CreditStore.getBalance()` always returns `limit: null` (nothing enforces a cap — `null` is explicitly treated as "uncapped"), and `RazorpayBillingProvider.isConfigured()` is a hardcoded `false` constant (`CHECKOUT_ROUTE_LIVE = false`) — Razorpay billing is code-complete but manually switched off pending real deployment, meaning **the desktop app currently refuses to open checkout at all**, tier or no tier.

### 6.3 Roles/RBAC — corroborates §1.8's finding independently

Two systems confirmed to coexist: a legacy hardcoded `OrgPermissions.ts` (four pure role-list functions, explicitly labeled in code as the pattern later phases should not repeat) and the Phase 0 data-driven `role_capabilities` engine. **Independently confirms §1.8:** `itAdministrator`/`securityAdministrator` get zero capability rows from the seed function, and a grep across every migration through Phase 6 confirms **no later migration ever grants either role anything** — this is not a temporary gap, it has persisted through six phases of active development. An `itAdministrator` today is functionally indistinguishable from a plain `member` except in the role-picker dropdown. Also newly noted: `organizationAdministrator` is deliberately capped below `organizationOwner` (no `organization.manage`/`roles.manage`) — reasonable, but undocumented anywhere a customer would see it.

### 6.4 pawos-web — marketing + checkout only, confirmed no dashboard exists anywhere on the site

Structure: home, download, pricing, checkout, docs, plus two billing API routes. **No account/subscription/org-management route exists on the website at all** — every such surface lives only in the Electron app.

**Checkout is real up through Razorpay's own subscription creation, but the sync-back path is a same-machine shortcut, not the webhook.** The webhook correctly verifies signatures but its handler **only logs the event** — the code's own comment: "pawos-web has no persistent account/subscription database yet... this honestly logs the verified event instead of writing to a database that doesn't exist." Actual desktop-side confirmation happens via a documented same-machine loopback ping (`CheckoutSyncServer.ts`) explicitly labeled "a UX shortcut, not a replacement for server-side verification." Combined with `RazorpayBillingProvider` being hardcoded off (§6.2), **the full purchase path is currently non-functional end-to-end** even though every individual piece of code for it exists.

**Website docs are an admitted skeleton** ("This is an early skeleton of PawOS's documentation site — full guides are still being written") while the in-app Help Center has 15 substantive article categories. A visitor who clicks "Read the docs" from the homepage gets a five-paragraph teaser, not real documentation — a real parity gap for anyone evaluating the product from the website alone, before ever installing the app.

---

## 7. AI Collaboration Audit (Paw-to-Paw, cross-device, cross-org)

Based on direct knowledge of the collaboration platform's architecture (§1):

| Capability asked about | Status |
|---|---|
| Individual AI (one Paw per user, per device) | **Real.** Every runtime works this way today. |
| Multiple AI agents within one account | **Not a concept.** One reasoning loop (`ConversationRuntime`) per app instance; no multi-agent orchestration, no sub-agent spawning within PawOS itself. |
| AI talking to AI (Paw-to-Paw) | **Does not exist.** There is no protocol, channel, or API for one user's Paw instance to communicate with another user's Paw instance directly. All "collaboration" is human-mediated through shared Supabase data (workspaces, tasks, control grants) — Paw never initiates contact with another Paw. |
| Cross-device collaboration | **Partial, and only for the human, not the AI.** Device identity/session infra exists (`DeviceIdentityStore`, `device_sessions` table, Settings → Devices) for *managing* which devices are signed in — this is about auth/session, not about syncing an in-progress conversation or task across a user's own two devices. There is no "resume this conversation on my other device" feature. |
| Cross-organization collaboration | **Does not exist by design.** RLS is scoped to `organization_id` everywhere; there is no cross-org sharing primitive (e.g., an agency working across two client orgs would need two separate memberships, with zero data bridging — which is almost certainly the correct call for a B2B product, but worth stating as a hard boundary, not an oversight). |
| Remote execution (one user's Paw acting on another's behalf) | **Only via Phase 5 Remote Assistance's control grants** — and that's explicitly *human-supervised, staged-consent, live-session* remote control (screen/keyboard/terminal), not autonomous AI-to-AI task delegation. |
| Workspace ownership / approval chains | **Real** (§1.2, §1.9) at the *human* level — an org member's action needing sign-off. Not an AI-agent concept. |
| Distributed engineering / ticket routing / repository ownership | See §9 below. |

**Verdict:** PawOS today is an **N individual AI copilots sharing a database**, not a multi-agent system. Every piece of "collaboration" in the roadmap is *human* collaboration mediated by shared cloud state — which is a legitimate and much simpler product to build and secure than genuine AI-to-AI delegation, but the roadmap's own language ("Paw-to-Paw collaboration," "distributed engineering") oversells what exists. See §14.

---

## 8. Engineering Organization Vision Audit

| Requirement | Status |
|---|---|
| 50 Jira tickets/day | **Not supported as a throughput claim.** `InvestigateTicketPlugin` (Infrastructure Runtime) investigates *one ticket at a time*, synchronously, in a single conversation turn, on one user's one machine. There is no ticket queue, no batching, no concurrency model. A team generating 50 tickets/day would need 50 manual "investigate this ticket" conversations unless a human explicitly triggers each one — there's no autonomous ticket-polling/auto-triage loop. |
| 100 Jira tickets/day | Same conclusion, worse. |
| Multiple repositories | **Partially supported at the data level** (`organization_repositories` links many repos to a workspace), **not supported at the execution level** — nothing orchestrates "check all N repos for X." Each investigation is scoped to whatever repo context the user gives Paw in that conversation. |
| Multiple developers | **Supported for shared visibility** (assignment, activity dashboard, branch ownership), **not supported for shared execution** — see §1.4. Two developers' Paw instances never coordinate; they only see each other's *recorded* activity after the fact. |
| Multiple PawOS instances (orchestration across them) | **Does not exist.** No instance-to-instance protocol (confirmed in §7). |
| Distributed workspaces | Workspaces are a real data container (§1.2) but "distributed" implies cross-instance coordination, which isn't there. |
| Approval workflows | **Real** (§1.9), for human sign-off on a single local action. |
| Automatic investigation | **Real, single-shot, human-triggered** — `InvestigateTicketPlugin`/`InvestigateProductionIssuePlugin`/Root Cause Engine (Infrastructure Runtime, built IR3-1). Genuinely does real browser/console/network inspection and confidence-ranked correlation. Not "automatic" in the sense of running unprompted on a schedule. |
| Automatic debugging | Same — real within one conversation, not a background daemon. |
| Automatic testing | **Only inside the Coding Canvas's Pro-tier "build/run/test/fix loop"** (CIR2-2.8) — this is scoped to one project the user is actively working on, not org-wide CI orchestration. |
| Automatic deployment | **Real for the single-deploy case** (shell out to Vercel/Netlify CLI), gated by local confirm + (optionally, Phase 6) org approval. Not a CI/CD pipeline replacement — no build matrix, no multi-environment promotion pipeline beyond the explicit staging→production `PromoteDeploymentPlugin`. |
| Learning from approvals/rejections | **Does not exist.** Approval decisions are recorded (audit log) but nothing feeds them back into future behavior — no model fine-tuning, no even-simple heuristic ("this kind of request usually gets denied, warn the user before they ask"). |
| Knowledge reuse / ticket memory / patch history / organization knowledge | **Real, but siloed per-store.** `EngineeringMemoryStore` (deployments/incidents/rollbacks/root causes), Communication Runtime's relationship memory, Office Memory Graph, Coding Runtime's project memory — each is its own store with its own shape (see §14 duplication finding). There is no single "organization knowledge graph" a query can span across runtimes. |

**Verdict:** the "engineering organization" vision in the roadmap describes something closer to **GitHub Copilot Workspace + PagerDuty + a shared dashboard**, all mediated by one human per machine clicking through it. It is **not** an autonomous multi-agent engineering org that processes ticket volume unattended. That gap should be named explicitly to whoever is pitching this to enterprise buyers — the current architecture cannot support "50-100 tickets/day" without a human manually invoking Paw per ticket.

---

# Part II — The 15 Requested Deliverables

Everything below synthesizes Part I (§1–§8) into the exact deliverable list requested. Nothing here introduces a new fact not already traced to a file path above — this section organizes and judges, it doesn't discover further.

## D1. Complete architecture map

```
┌─────────────────────────────────────────────────────────────────────────┐
│ ELECTRON APP (individual, always installed)                             │
│                                                                           │
│  RENDERER                                    MAIN                       │
│  ┌─────────────────────────┐                ┌────────────────────────┐ │
│  │ ConversationRuntime      │◄──IPC bridge──►│ DesktopExecutionEngine │ │
│  │  (state machine, 1 turn) │                │  (~170 plugins,        │ │
│  │  ├─ ReasoningRuntime     │                │   1 recovery loop)     │ │
│  │  │   └─ 5 providers +    │                │   ├─ file/process/git  │ │
│  │  │      1 offline shim   │                │   ├─ Coding gate       │ │
│  │  ├─ IntentRegistry       │                │   │  (CodingModeStore) │ │
│  │  │   (164 tools, no      │                │   ├─ Infra gate        │ │
│  │  │    separate planner)  │                │   │  (InfraModeStore)  │ │
│  │  ├─ ExecutionQueue/      │                │   ├─ Destructive-      │ │
│  │  │   Supervisor (order/  │                │   │  confirm gate      │ │
│  │  │   log only)           │                │   │  (PendingApproval  │ │
│  │  └─ TaskCard UI          │                │   │   Store, local)    │ │
│  └───────────┬──────────────┘                │   └─ BasePlugin        │ │
│              │                                │      lifecycle        │ │
│  ┌───────────▼──────────────┐                └───────────┬────────────┘ │
│  │ Runtime-specific UI       │                            │              │
│  │ (WorkspaceRuntime shell:  │        ┌───────────────────┼───────────┐ │
│  │  Coding Canvas, Infra     │        │  Runtime backends (main proc) │ │
│  │  Canvas, Office/Browser/  │        │  ┌──────────────┐ ┌─────────┐ │ │
│  │  Communication panels)    │        │  │Infrastructure│ │Browser  │ │ │
│  └───────────────────────────┘        │  │ConnectorReg. │ │Runtime  │ │ │
│                                        │  │(GH/GL/Linear/│ │(CDP,    │ │ │
│  ┌───────────────────────────┐        │  │ Jira/Vercel/ │ │ no reg.)│ │ │
│  │ Companion 3D stack        │        │  │ Netlify+CLI) │ └─────────┘ │ │
│  │ (sole renderer; 2D dead)  │        │  └──────────────┘             │ │
│  └───────────────────────────┘        │  ┌──────────────┐ ┌─────────┐ │ │
│                                        │  │Communication │ │Office   │ │ │
│  ┌───────────────────────────┐        │  │ConnectorReg. │ │ConnReg. │ │ │
│  │ Organization system       │        │  │(desktop audio│ │(defined,│ │ │
│  │ (buried in Settings→      │        │  │ real; mobile/│ │ 0 regis-│ │ │
│  │  Account, no nav entry)   │        │  │ bot-join stub│ │ tered)  │ │ │
│  └───────────┬───────────────┘        │  └──────────────┘ └─────────┘ │ │
│              │                        └───────────────────────────────┘ │
│              │                        ┌───────────────────────────────┐ │
│              │                        │ Memory (2 parallel systems)    │ │
│              │                        │  MemoryGraphStore (generic,    │ │
│              │                        │   provenance-tracked, most     │ │
│              │                        │   runtimes wrap it) +           │ │
│              │                        │  ~6 standalone flat-JSON       │ │
│              │                        │   stores (Workspace/Execution/ │ │
│              │                        │   Error/Engineering/           │ │
│              │                        │   Communication/Conversation)  │ │
│              │                        └───────────────────────────────┘ │
└──────────────┼────────────────────────────────────────────────────────┘
               │ direct Supabase calls (no IPC — cloud-native data)
               ▼
┌─────────────────────────────────────────────────────────────────────────┐
│ SUPABASE (Team & Enterprise only — Phases 0–6)                          │
│  organizations / organization_members / role_capabilities /              │
│  organization_policies / audit_log / organization_workspaces /           │
│  workspace_projects / organization_companions / credit_pools /           │
│  workspace_tasks / organization_temp_grants / organization_repositories/ │
│  branch_ownership / pull_request_reviews / presence+Yjs (no table) /     │
│  remote_assistance_sessions / control_grants /                          │
│  organization_credentials (Phase 6, not yet approved) /                  │
│  organization_approval_requests (Phase 6, not yet approved)              │
└─────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────┐
│ pawos-web (Next.js) — marketing + checkout ONLY, no dashboard exists     │
│  home / pricing / checkout (Razorpay, currently hardcoded OFF) /         │
│  docs (admitted skeleton) / download                                    │
└─────────────────────────────────────────────────────────────────────────┘
```

## D2. Runtime dependency graph (textual)

- `ConversationRuntime` depends on `ReasoningRuntime` (via injected callbacks) and on `DesktopExecutionEngine` (via IPC bridge callbacks) — never imports either directly.
- `DesktopExecutionEngine` depends on: `CodingModeStore`, `InfraModeStore`, `PendingApprovalStore` (gates), and every plugin's own dependency (e.g. `InfrastructureConnectorRegistry`, `BrowserRuntime`, `CommunicationRuntime`, `OfficeConnectorRegistry` — the last unpopulated).
- `InfrastructureConnectorRegistry`, `CommunicationConnectorRegistry`, `OfficeConnectorRegistry` are structurally identical and independent of each other — no shared base class, just a shared convention (deliberate, per their cross-referencing comments).
- `BrowserRuntime` depends on nothing else runtime-side; it's the one true leaf, used *by* Coding Canvas (dev browser, separate class), Infrastructure Runtime (investigation), and directly by the model via `IntentRegistry` tools.
- `MemoryGraphStore` is depended on by: coding, infrastructure, office, companion, browser-research/comparison wrappers. It depends on nothing else.
- The five-plus flat-JSON stores (`WorkspaceMemoryStore`, `ExecutionMemoryStore`, `ErrorMemoryStore`, `EngineeringMemoryStore`, `CommunicationMemoryStore` + its four siblings, `ConversationSessionStore`) depend on nothing else and are not depended on by `MemoryGraphStore` — two disconnected graphs.
- `EntitlementService` is depended on by `useConversationController` (gates every turn) and `SubscriptionSection`/`UsageSection` UI — it is *not* depended on by `CodingModeStore`/`InfraModeStore` (confirmed separate, deliberately, per §3.1/§6.2), which is the one dependency edge most likely to confuse a new engineer given the identical `go`/`pro` vocabulary.
- The Team & Enterprise organization system (`OrganizationService`, `PermissionService`, `CredentialVaultService`, `GovernanceGate`, `RemoteAssistanceService`, `CrmService`, `CreditPoolService`) depends on Supabase directly (no IPC) and is depended on by exactly one UI entry point (`OrganizationSection.tsx`, nested in Settings → Account) plus `Communication Runtime`'s `OrgSyncBridge`. Nothing else in the app depends on it, including onboarding.
- `GovernanceGate` (Phase 6) wraps `useConversationController`'s `executeAction` callback *before* it reaches `DesktopExecutionEngine`, meaning the dependency chain for a governed action is now: Conversation → GovernanceGate → IPC → DesktopExecutionEngine → PendingApprovalStore. Two approval concepts, one call chain — see D5.

## D3. Runtime responsibility matrix

| Runtime | Purpose | Real backend | Individual | Team | Enterprise |
|---|---|---|---|---|---|
| Conversation | Turn lifecycle, STT/TTS, tool-call loop | Yes, fully | ✅ | ✅ (unaffected by org) | ✅ |
| Reasoning | Provider-agnostic LLM streaming | Yes, 5 real providers | ✅ | ✅ | ✅ |
| Planning | N/A — implicit in Reasoning's tool loop | N/A by design | — | — | — |
| Automation / Desktop Execution Engine | Every OS-effecting action, ~170 plugins | Yes, fully | ✅ | ✅ | ✅ |
| Coding Runtime | Coding Canvas UI + Go/Pro local gate | Real except `codingMemory` region | ✅ | ✅ | ✅ |
| Browser | Real CDP automation, no registry | Yes, fully | ✅ | ✅ (no org-sharing) | ✅ (no org-sharing) |
| Search | Folded into Browser (no separate runtime) | Yes (DuckDuckGo scrape) | ✅ | ✅ | ✅ |
| Communication | Meeting/call capture, transcription, CRM | Desktop capture real; phone/bot-join stub | ✅ | ✅ (only runtime with real org-sharing) | ✅ |
| Office | Local doc/sheet/slide creation | Real locally; cloud connectors unpopulated | ✅ | ⚠️ no org-sharing | ⚠️ no org-sharing |
| Infrastructure | Connectors, investigation, deploy/rollback | Real for GH/GL/Linear/Jira/Vercel/Netlify | ✅ | ✅ (advisory-only sharing) | ✅ |
| Deployment | Vercel/Netlify deploy+rollback+promote | Real, no pre-deploy test gate | ✅ | ✅ | ✅ (Phase 6 governance gate) |
| Memory | Two parallel systems (graph + flat logs) | Both real, not unified | ✅ | ✅ | ✅ |
| Companion | 3D avatar, personality/voice/memory | Real; avatar-gen explicitly rejected | ✅ | ✅ | ✅ |
| Remote Assistance | Screen share/control/terminal | Real, most heavily verified subsystem | — | ✅ | ✅ |
| Team/Enterprise (org) | RBAC, workspaces, credit pools, audit | Real, Phase 0–5 approved, Phase 6 pending | — | ✅ | ✅ |
| Security (RLS/RBAC) | Not a standalone runtime — enforced in Supabase RLS + `has_capability()` + local gates | Real | ✅ (local only) | ✅ | ✅ |
| Audit | `audit_log` table + generic trigger, one UI card | Real, extended in Phase 6 | — | ✅ | ✅ |
| Billing/Entitlement | Tier gating, credits | Real gating; Razorpay hardcoded off | ✅ | ✅ | ✅ |
| Plugin/Connector | Not one runtime — 4 independent registries (Infra/Comm/Office/Avatar) + Browser's flat-adapter variant | 3 of 4 populated | ✅ | ✅ | ✅ |
| Orchestrator | **Does not exist as a named runtime** — closest equivalent is the LLM's own function-calling loop, explicitly stated in the system prompt to carry 100% of planning | N/A | — | — | — |

## D4. Missing runtime report

- **Orchestrator/Planner Runtime** — does not exist; the system prompt says so itself. Fine for today's single-user, single-task model; a hard blocker for §8's "engineering organization" vision (ticket queues, multi-repo parallelism) without building one.
- **Search Runtime** — not missing exactly, but mis-named in the roadmap's own vocabulary: it's a thin feature of Browser Runtime, not a peer runtime. No real search-API connector (Bing/Google/SerpAPI) exists — only DOM-scraped DuckDuckGo.
- **Knowledge Runtime** (a single cross-runtime knowledge graph) — does not exist. `MemoryGraphStore` is the closest candidate and already has the right shape (provenance, versioning, cross-referenced entities) but several major stores (Execution, Error, Engineering, Communication history) sit outside it.
- **Notification/Activity Runtime** — does not exist as a single surface; four Dashboard sections independently derive overlapping views of the same execution log (§5.4).
- **Multi-instance orchestration ("Distributed Engineering")** — does not exist at any layer; confirmed absent in §7/§8/§3.2.
- **A real Mobile Companion app** — does not exist; every mobile-dependent feature (phone capture, mobile pairing shown in onboarding) is architecture-only with honest disclosure.

## D5. Duplicate functionality report

1. **Two approval systems** (§1.9): `PendingApprovalStore` (local, single-user, pre-existing) vs. `organization_approval_requests` (org-level, Phase 6). Correctly layered, not broken, but overlapping vocabulary invites confusion. **Recommend:** rename one — e.g. keep "Approval Queue" for the local one, call the org one "Governance Requests" — purely a naming fix, no architecture change needed.
2. **Two memory systems** (§2.4): `MemoryGraphStore` vs. ~6 flat-JSON stores. Self-aware duplication, each with disclosed rationale — but still two places to look. **Recommend:** no urgent code change, but new runtimes should be required to build on `MemoryGraphStore` only, and a follow-up pass could migrate the flat stores' data into typed graph wrappers without changing their external API.
3. **Two "go/pro" vocabularies** (§3.1/§6.2): local Coding Mode toggle vs. paid subscription tier, same strings, different meanings, kept apart in code but not in name. **Recommend:** rename the local toggle's values (e.g. `restricted`/`unrestricted` or `investigate`-style verbs) — this is the single cheapest fix in the whole audit with real support-ticket-avoidance value.
4. **Four Dashboard "recent activity" views** (§5.4) — Home, Work History, Conversation History, Projects all reading the same `ExecutionRecord` log. **Recommend:** keep Work History as the canonical detailed timeline; make Home's "recent activity" and Projects' folder list explicit *filtered views* of it rather than independent re-derivations, and say so in the UI copy.
5. **Browser Runtime's adapter pattern vs. the other three ConnectorRegistries** — same idea, different shape, purely a naming/discoverability inconsistency (§4.4), not a functional bug.

## D6. UX audit

- **Biggest finding, repeated from §5.4 for emphasis:** the entire Team & Enterprise platform is invisible from onboarding, the sidebar, and the profile menu — it exists only as a scrollable card inside Settings → Account. For a product whose roadmap is explicitly about enterprise ambition, this is the single largest gap between what's built and what a buyer can discover.
- **No org switcher exists at all** — the data model assumes one org per user (`orgs[0]`), with no UI path even to *notice* this limitation until a user somehow needs a second org.
- **Settings has a hidden two-level hierarchy** (Preferences' own 5-tab sub-nav) that isn't visually signaled from the top-level Settings tab bar.
- **Onboarding never asks about teams** — a Team/Enterprise-intending user's first 15 steps are identical to a solo user's.
- **Companion configuration is split across two top-level places** (Companion Studio vs. Settings → Preferences), correctly cross-linked but still two places.
- **Positive findings worth keeping:** the Apps hub is a genuinely coherent unification of five real runtimes with an honestly-disabled sixth tile; the onboarding wizard's resumability and real permission-request flow are well executed; Task Cards collapsing a whole multi-step action into one UI element is a strong pattern that should be the template for any future "activity" unification (D5.4).

## D7. Security audit

- **RLS-everywhere is real and consistently applied** across every Team/Enterprise table (§1), anchored by one `has_capability()` security-definer function that every policy calls — not reinvented per table.
- **Phase 6's credential vault decrypt-gate was caught and corrected before deployment** (§1.7) — a real example of the audit discipline working as intended (gated on membership, not just admin, once the actual product intent was reasoned through).
- **Two roles carry zero real capability** (`itAdministrator`, `securityAdministrator`, §1.8/§6.3) — not a leak (they can't do anything), but a real trust/expectation gap: an Enterprise buyer who assigns someone "Security Administrator" today gets a label, not a permission set. This is a security-*posture* risk (false sense of least-privilege configuration) even though it's not an active vulnerability.
- **Remote Assistance's Realtime dependency is a real single-point-of-degradation** (§1.6) — no fallback transport exists if Supabase Realtime has an outage; screen sharing/terminal/instant-revoke all degrade together.
- **Local destructive-action gating is centralized and consistently enforced** (`DESTRUCTIVE_ACTION_TYPES`, one check in `DesktopExecutionEngine`) rather than scattered per-plugin — a genuinely good security architecture choice, confirmed by direct code reading, not assumed.
- **Secrets discipline is consistently honest**: infra credentials never logged as values (name-only in the memory graph), env-var-based today, Phase 6's vault uses real column-level `pgcrypto` encryption rather than plaintext.
- **No evidence of credential leakage in memory/logs** was found in either research pass — `ErrorMemoryStore`/`EngineeringMemoryStore` store structured facts, not raw payloads, based on the file-level descriptions gathered.

## D8. Enterprise audit

Pretending to be a 1000+-person enterprise buyer evaluating this product:

- **RBAC exists but two of seven advertised Enterprise roles do nothing** (D3/D7) — a serious gap for a security-conscious buyer who will read the role list literally.
- **SSO is honestly scoped** as "record your intent, we'll help you configure it on Supabase's side" (Phase 6) — correct engineering honesty, but not yet a self-service SSO enablement flow an enterprise IT team could complete themselves without a support conversation.
- **Audit logging is real and now exportable** (Phase 6 CSV/search/filter) — a genuine, checkable compliance-evidence answer, not just a marketing claim.
- **Governance/approval workflows are real** (Phase 6) but scoped only to three infra actions (`infra.deploy`/`rollback`/`promote`) today — an enterprise buyer asking "can we require approval for X" for any other sensitive action (e.g. member removal, credential changes) would find the mechanism exists in principle (the `organization_policies`/`requires_approval` shape is generic) but isn't wired to anything else yet.
- **No org switching, no cross-org isolation testing described beyond RLS** — a buyer running a multi-subsidiary structure would need to confirm (not found in this audit) whether one Supabase project can cleanly host multiple unrelated enterprise customers, or whether each Enterprise customer needs its own project.
- **The engineering-organization pitch (§8) does not hold up literally** — "distributed engineering across multiple developers/repos/PawOS instances" and "50-100 tickets/day" are not supported by the current single-user-per-machine execution model. An enterprise buyer sold on that specific vision would be disappointed by what ships today.

## D9. Individual user audit

Pretending to be a solo developer/freelancer:

- **This is where the product is strongest.** Conversation/Reasoning/Automation/Coding/Browser/Office/Communication/Companion all work coherently for one person on one machine, with real streaming voice, real tool-calling across 164 tools, and consistently honest failure messaging rather than fake success.
- **Onboarding serves this persona well** — resumable, real permission requests, no org-related noise to wade through.
- **Guest mode is functionally fine but architecturally soft** (D1/§6.1) — it works today because nothing exercises the gap, but there's no hard guarantee a future code path couldn't accidentally grant a guest session real entitlements, since there's no dedicated "guest" tier value enforcing it.
- **Pro vs Pro Max is a real gap specifically for this persona** — someone paying $100/mo instead of $20/mo for "higher usage limits" and "priority model access" is paying for something the code does not currently deliver.

## D10. Team workflow audit

Pretending to be a 5-person startup or 20-person agency:

- **Sign up → create workspace → invite member → create project**: real, functional, domain-restricted invites work (blocks personal email domains), role assignment works. **But this entire flow is undiscoverable** without already knowing to look in Settings → Account (D6) — a real team lead would likely miss that this exists on first use.
- **Deploy/PR review/branch ownership**: real data-level tracking, but execution is always local-machine — "my teammate's Paw did the deploy" is not a real workflow; only "I can see that my teammate deployed" is.
2- **Remote Assistance**: the most mature, most heavily-verified team collaboration feature — genuinely useful for the "5-person startup helping each other debug" scenario, with one disclosed operational risk (Realtime dependency, D7).
- **Credential vault (Phase 6, unapproved)**: solves a real, previously-missing need (shared GitHub/Vercel tokens instead of every teammate configuring their own) — correctly scoped, pending live verification.
- **Communication org-sharing is real; Office/Browser org-sharing does not exist** — a team's shared documents or shared research have no organizational visibility today, only shared meeting/contact data does (§4.4).

## D11. AI collaboration audit

Restated from §7 for completeness in the deliverable list: individual AI is real; multi-agent, AI-to-AI, and cross-org collaboration do not exist; cross-device is auth/session-only, not conversation-resuming; remote execution exists only as human-supervised Remote Assistance, not autonomous delegation. **Verdict repeated:** PawOS today is N individual copilots sharing a database, not a multi-agent system — a legitimate, simpler, more securable design than what the roadmap's own language ("Paw-to-Paw collaboration") implies exists.

## D12. Ticket automation audit

Restated from §8: single-ticket, single-shot, human-triggered investigation is real and good (genuine root-cause correlation, honest confidence-capping). Volume claims ("50-100 tickets/day") are not supported by any queueing/concurrency mechanism — confirmed absent in the Desktop Execution Engine (§3.2). No learning-from-approval-history loop exists. Knowledge reuse is real but siloed per-store (§2.4/§8), not a queryable cross-runtime organization knowledge base.

## D13. Coding Runtime audit

Restated and consolidated from §3.1: 10 real Coding Canvas sections (not the ~12 originally assumed), 9 of which are genuinely wired to real data, one (`codingMemory`) a confirmed honest placeholder. The Go/Pro local capability gate is real, centrally enforced at the engine layer — its only real problem is sharing a name with an unrelated billing concept (D5 #3). Build/test/deploy automation's precise boundary (§3.4) is now fully clarified: real git/build/test tooling inside Coding Canvas, but **no pre-deploy test gate exists anywhere in the actual deploy path** — the "auto-fix loop" is prompt-level guidance, not a code-enforced gate, which is a meaningful distinction for anyone assuming test-before-deploy is guaranteed.

## D14. Production readiness audit

- **Backend (Supabase/Team & Enterprise):** Phases 0–5 approved and frozen after genuine multi-pass verification (three real defects found and fixed in Phase 5 alone — a healthy sign the verification process works, not just a rubber stamp). Phase 6 implemented, typechecked, built, migration applied — **live UI verification still outstanding**, correctly not yet marked approved.
- **Desktop app:** the core loop (Conversation/Reasoning/Automation) is mature and heavily used across dozens of prior verification passes (per the task history). Individual-tier functionality is genuinely production-shaped.
- **Website/checkout:** **not production-ready today** — confirmed the full purchase path is non-functional end-to-end (Razorpay provider hardcoded off, webhook doesn't persist anything, sync relies on a same-machine loopback shortcut). This is the single clearest "looks done, isn't" finding of the whole audit — every individual piece of code exists and looks real, but the assembled path does not currently let a real customer pay and have it stick without manual intervention.
- **Documentation:** in-app Help Center is substantial (15 categories); website docs are an admitted skeleton — a real pre-purchase evaluation gap.
- **Enterprise features:** governance/audit/SSO scoping exist and are honest about their own limits, but two of seven Enterprise roles are non-functional labels, and there's no org-switching UI at all.

## D15. Final recommendations

Ranked by leverage (impact vs. effort), not by section order:

1. **Give the Team & Enterprise platform a real discovery path.** Add an organization step to onboarding (skippable, but present) and a visible entry point in the Sidebar/ProfileMenu, not just a Settings → Account card. This is free relative to the platform's own size — the backend is already built; this is pure navigation/UX work. Highest-leverage single change available.
2. **Rename the local Coding/Infra mode toggles away from `go`/`pro`.** Purely a string rename plus updating the one help article that already has to explain the collision. Removes a real, avoidable support burden at near-zero engineering cost.
3. **Flip the Razorpay checkout path on, or explicitly and visibly label pricing/checkout as "coming soon."** Right now it silently looks live but isn't — a prospective customer hitting a dead purchase flow is worse than an honest "not yet" message, which this codebase is otherwise very good at.
4. **Either differentiate Pro Max from Pro in code, or stop marketing a difference that doesn't exist.** Whichever direction, resolve the mismatch before more customers pay for a promise the code doesn't keep.
5. **Grant `itAdministrator`/`securityAdministrator` real capabilities, or remove them from the role picker until they're ready.** A labeled-but-empty security role is worse than no role at Enterprise-buyer trust level.
6. **Rename one of the two "approval" systems** (local `PendingApprovalStore` vs. org-level `organization_approval_requests`) to remove the vocabulary collision before more governance features are layered on top of both.
7. **Do not attempt to build "distributed engineering" (§8/§11) on the current architecture without first designing an orchestration/queueing layer.** This is the one item on the roadmap that requires genuinely new architecture, not incremental UX/naming fixes — flag it honestly to stakeholders as a distinct, larger initiative rather than an extension of what exists.
8. **Consider requiring all new memory needs to build on `MemoryGraphStore`** rather than adding a seventh flat-JSON store — not urgent to migrate existing stores, but worth stating as a going-forward rule given how consistently every new runtime *has* correctly followed this pattern except the original handful.
9. **Unify the four "recent activity" Dashboard views** into one canonical timeline with filtered sub-views, once bandwidth allows — lower priority than 1–6 since it's a real but cosmetic duplication, not a trust or revenue gap.

**Overall verdict on the founding question — "is PawOS a complete AI Operating System for Individuals, Teams, and Enterprises":** **Individuals: yes, close to complete and genuinely well-built.** **Teams: architecturally real but functionally undiscoverable** — the gap is navigation/onboarding, not missing engineering. **Enterprises: partially real, with specific, nameable, fixable gaps** (two dead roles, unscoped governance beyond three actions, no org-switching) rather than a wholesale missing layer — and one roadmap claim (autonomous distributed engineering at ticket-queue scale) that the current architecture genuinely cannot support without new orchestration design, which should be named to stakeholders as such rather than treated as an incremental feature.

---

*End of audit. No code was modified. Awaiting explicit approval before any architectural or implementation change proceeds.*
