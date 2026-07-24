# PawOS V1 — Complete Architecture Design

**Status: DESIGN ONLY. No code has been written or modified for this document.** This is a target-state specification building directly on the accepted `PAWOS_ARCHITECTURE_AUDIT.md` findings. Every design decision below either keeps, merges, splits, or demotes a runtime that audit already characterized — nothing here is preserved by default. **Awaiting approval before any implementation begins.**

The governing constraint carried forward from the audit and from this codebase's own Phase 3 migration comment, restated because it shapes nearly every decision below: **execution always happens locally, on whichever device is doing the work, right now.** PawOS V1 does not introduce remote-triggered execution on someone else's machine. Every "multi-Paw" capability designed here is a *claim-and-pull* model over shared cloud state, never a *push* model that reaches into another device.

---

## Part I — Runtime-by-Runtime Verdict

For each runtime named in the audit, one of four verdicts: **KEEP** (works, stays a runtime), **MERGE** (folds into another runtime as a capability), **SPLIT** (currently overloaded, needs separation), or **NEW** (doesn't exist, must be built for V1).

| Runtime (as named in the roadmap/audit) | Verdict | Reasoning |
|---|---|---|
| Conversation Runtime | **KEEP** | Real, mature, the correct place for single-agent turn lifecycle. No change needed. |
| Reasoning Runtime | **KEEP** | Real provider abstraction, doing exactly the job it should. |
| Planning Runtime | **MERGE → becomes two things** | Per-turn planning stays implicit in the LLM loop (audit confirmed this is a deliberate, working simplicity choice — do not build a per-turn planner). Org-level, multi-agent planning becomes the new **Orchestrator Runtime** (see Part III) — a different job at a different layer, not "Planning Runtime" resurrected. |
| Automation Runtime / Desktop Execution Engine / Action Engine | **KEEP, rename for clarity** | Audit confirmed these three names already refer to one real class. Standardize on **Execution Runtime** in all new documentation/code going forward — no functional change, a naming cleanup only. |
| Coding Runtime | **KEEP, harden** | High-value, real, differentiated. Gets a full V1 redesign in Part IV — restructured on top of the same Execution Runtime, but with the `go`/`pro` naming collision removed and a real pre-deploy test gate added. |
| Browser Runtime | **KEEP** | Real, well-isolated (correctly separate from DevBrowserManager's stricter local-preview boundary). Stays a shared capability every other runtime calls into, not a peer product surface. |
| Search Runtime | **MERGE into Browser Runtime** | Confirmed to never have been a separate runtime — it's a documented `web_search` capability of Browser Runtime. Make this official: remove "Search Runtime" from the roadmap's own vocabulary. |
| Memory Runtime | **SPLIT → unify, then re-merge with Knowledge** | Audit found two parallel systems (one graph, six flat logs). V1 design: **`MemoryGraphStore` becomes the only canonical backend** ("Memory & Knowledge Runtime," see below). Existing flat stores are not ripped out (that's real, working data), but no new flat store may be created going forward — every new fact type gets a typed wrapper over the graph. |
| Automation/Action Engine | *(see Execution Runtime above — duplicate roadmap entry, same class)* | — |
| Remote Assistance Runtime | **KEEP** | Real, mature, most heavily verified subsystem in the whole platform. No change. |
| Team Runtime / Enterprise Runtime | **MERGE → becomes one Organization Runtime** | These were never actually two runtimes — they're two *tiers* of the same underlying RBAC/workspace/audit system. V1 makes this literal: **one Organization Runtime**, with tier-gated capability sets (Team vs Enterprise), not tier-gated code paths. This is the central architectural move that makes "one platform, not separate products" true rather than aspirational. |
| Security Runtime | **Does not become a runtime — stays cross-cutting, by design** | Security is enforced at the point of data access (Supabase RLS + `has_capability()`) and the point of action execution (Execution Runtime's destructive-gate). Centralizing this into a separate "Security Runtime" service would create a bypassable seam — the current distributed-enforcement model is *correct* and should be explicitly preserved, not consolidated. |
| Audit Runtime | **MERGE into Organization Runtime** | It's already one table (`audit_log`) + one trigger, surfaced as a capability of the org system. Formalize it as the Organization Runtime's "Audit" capability rather than implying a separate service exists. |
| Deployment Runtime | **MERGE into Infrastructure Runtime** | Deploy/rollback/promote are already plugins inside Infrastructure Runtime's plugin family. Don't invent a second runtime for a sub-capability that already lives correctly inside the first one. |
| Knowledge Runtime | **MERGE with Memory Runtime** | These should never have been two concepts. One graph-backed store, one name: **Memory & Knowledge Runtime**. |
| Integration Runtime | **Does not become one runtime — stays 3 domain registries + 1 shared interface** | Infrastructure/Communication/Office connector registries are already structurally identical by convention. V1 formalizes a shared `ConnectorRegistry<TAdapter>` generic base (a type-level change, not a new runtime) so the pattern is enforced by the compiler instead of by comments. **Office's registry gets deleted, not populated** — it has zero real registrations and zero call sites; the local-file plugins that already do the real work stay as-is. Don't preserve a dead abstraction just because it exists. |
| Plugin Runtime | **Does not become a separate runtime** | It's the `BasePlugin` lifecycle inside Execution Runtime. No change. |
| Orchestrator Runtime | **NEW — the single most important addition in V1** | Does not exist today. Required to make "10 Paws / 100 Paws" real. Full design in Part III. |

**Summary of the runtime count change:** the roadmap's ~19-name list collapses to **9 real runtimes** for V1: Conversation, Reasoning, Execution, Coding (built on Execution), Browser, Memory & Knowledge, Organization, Infrastructure (includes Deployment), Remote Assistance — plus the new Orchestrator. Communication, Office, and Companion remain as they are (real, working, not touched by this consolidation) — omitted from the table above only because the audit found no merge/split/rename question for them.

---

## Part II — Complete Runtime Architecture

### Hierarchy

```
Layer 0 — Reasoning         (Reasoning Runtime: model access, provider-agnostic)
Layer 1 — Cognition         (Conversation Runtime: one agent's turn lifecycle)
Layer 2 — Execution         (Execution Runtime: every OS-effecting action, ~170 plugins)
Layer 3 — Domain Runtimes   (Coding, Browser, Communication, Office, Infrastructure, Companion)
                              — each is a UI + plugin-family + capability-check layer
                              — over Layer 2, never bypassing it
Layer 4 — Knowledge         (Memory & Knowledge Runtime: cross-runtime graph, org-shared when scoped)
Layer 5 — Organization      (Organization Runtime: RBAC, workspaces, audit, governance, credit —
                              cloud-backed, the only layer with no "local-only" mode)
Layer 6 — Orchestration     (Orchestrator Runtime, NEW: multi-agent task queue, ticket routing,
                              claim-based assignment — sits above Organization, coordinates
                              many individual Conversation Runtimes across many devices)
```

Each layer only calls downward or sideways within its own layer — never upward. (E.g. Execution Runtime never calls into Conversation Runtime; Organization Runtime never calls into any Domain Runtime directly — Domain Runtimes read/write Organization Runtime data, the dependency points down, not up.)

### Responsibilities (by layer)

- **Reasoning:** turn text/tool-schema in, streamed tokens/tool-calls out. Zero knowledge of what a tool call does.
- **Cognition (Conversation):** own the turn state machine, tool-call loop, recovery policy, Task Card narration, billing-credit consumption. Zero knowledge of *how* an action executes.
- **Execution:** own plugin lifecycle (`requirements→prepare→execute→observe→verify→recover`), the three local gates (Coding mode, Infra mode, destructive-confirm), `PendingApprovalStore`. Zero knowledge of *why* an action was requested.
- **Domain Runtimes:** own their plugin sub-family, their own UI region, their own connector registry (where one exists), and — new in V1 — a single required method per domain: `getOrgScope(request): { organizationId, workspaceId } | null`, so Organization Runtime can decide whether a given action needs org-visibility/governance-check without each domain runtime hand-rolling that logic (see §"Org-scoping contract" below).
- **Memory & Knowledge:** own `MemoryGraphStore`. New in V1: every entity gains an optional `organizationId` + `visibility: 'private' | 'org'` field (additive, defaults preserve today's local-only behavior for Individual/Guest).
- **Organization:** own `organizations`, `organization_members`, `role_capabilities`, `organization_policies`, `audit_log`, `organization_workspaces`, credit pools, credential vault, governance/approval requests. The only layer allowed to talk to Supabase directly from the renderer (existing "direct-Supabase, no IPC" pattern, unchanged).
- **Orchestrator (NEW):** own the org-scoped task queue's *assignment* semantics — who can claim what, in what order, under what capability/repo-ownership constraints. Does **not** own execution (that's still each individual Paw's own Conversation+Execution Runtime pair) and does **not** own the task data model itself (that's still `workspace_tasks`, already real from Phase 2 — Orchestrator adds a thin claim/routing layer on top, not a new task store).

### Communication

- Reasoning ↔ Conversation: in-process function calls (same as today).
- Conversation ↔ Execution: IPC bridge (renderer ↔ main), unchanged from today.
- Domain Runtime ↔ Memory & Knowledge: in-process (main process) typed wrapper calls, unchanged.
- Domain Runtime ↔ Organization: direct Supabase client calls from the renderer (unchanged pattern) *or*, for main-process-only domains (Infrastructure), a thin renderer-side bridge that mirrors what Phase 6's `GovernanceGate.ts` already does — check org policy before letting a local action proceed. This is not new plumbing; it's declaring the existing Phase 6 pattern as the platform-wide standard instead of an Infrastructure-only special case.
- Any Paw ↔ Orchestrator: Supabase Realtime subscription (same broadcast-channel mechanism Phase 4/5 already use) for "a task became available/was assigned to me" events, plus ordinary REST/RPC for claim/release/status-update. **No new transport is introduced** — Orchestrator rides the same rails as the rest of the Organization Runtime.
- Paw ↔ Paw: **never direct.** All coordination is mediated through Organization Runtime's shared state (task records, comments, audit log). This is a deliberate design decision, detailed in Part III.

### Permissions

Single mechanism, unchanged: `role_capabilities` + `has_capability()`. V1 adds new capability strings only — no new permission *mechanism*:
- `tasks.claim`, `tasks.assign`, `tasks.route` (Orchestrator)
- `memory.org.read`, `memory.org.write` (org-scoped Memory & Knowledge entries)
- Reassign the existing `credentials.manage`, `approvals.decide`, `sso.manage`, `policies.manage` capabilities away from being granted to Team's `owner`/`organizationOwner` universally — see Part V (tier audit) for the specific rebalancing.

### Lifecycle

- **Local runtimes (Conversation/Execution/Coding/Browser/Office/Companion):** lifecycle is "app open → app closed." No persistence of in-flight state across restarts beyond what already exists (session stores).
- **Organization Runtime:** lifecycle is independent of any single device — a workspace/task/policy exists whether or not any Paw is currently running. This asymmetry is already true today (it's just a cloud database) and doesn't change.
- **Orchestrator-claimed tasks (NEW):** a claim has a lease — if a device claims a task and goes offline for longer than a configurable window (default: 4 hours, stored as an `organization_policies` value, reusing the existing generic policy mechanism — no new table), the claim auto-releases back to the queue via the same `pg_cron` sweeper pattern Phase 2's temp-grant expiry already uses. This prevents a task silently dying because someone's laptop closed.

### Events

- Existing: `Realtime.postgres_changes` on every org table (unchanged), `DesktopExecutionEngine`'s `observation` events (unchanged).
- New: a `task_claim_changed` broadcast event (org-scoped Realtime broadcast channel, same mechanism as Phase 5's control-grant instant-revoke) so every idle Paw watching the queue sees a claim/release the instant it happens — enables the "any idle Paw can claim" pull model without polling.

### APIs

- No new IPC surface required for anything in Part II except: `orchestrator:listClaimableTasks`, `orchestrator:claimTask`, `orchestrator:releaseTask`, `orchestrator:reportTaskProgress` — four new renderer-side service methods on a new `OrchestratorService.ts`, following the exact direct-Supabase pattern every other org service already uses. No main-process changes needed for these four (they're pure data operations); the *work itself*, once claimed, is dispatched through the existing Conversation Runtime exactly as if the user had typed the ticket contents themselves.

### Dependencies

Unchanged from the audit's dependency graph (D2) except: **Orchestrator depends on Organization Runtime (task table, capabilities, Realtime) and is depended on by nothing except the UI that lists claimable tasks.** It never depends on, and is never depended on by, any Domain Runtime directly — a claimed task is handed to Conversation Runtime as ordinary input, the same way a typed message is. This is the key simplicity property of the whole design: **the Orchestrator's only job is deciding who gets to start, never how the work happens.**

---

## Part III — The AI Organization (1 Paw → 10 Paws → 100 Paws)

### Agent identity

Extends the existing `device_sessions` table (Settings Foundation phase) rather than inventing a new identity concept. Each row already represents one (user, device) pair. V1 adds:
- `agent_status`: `idle | working | offline` (derived: last-heartbeat timestamp, not a separately-set flag, to avoid a stale "working forever" state).
- `agent_capabilities`: a jsonb array naming which configured connectors/repos this specific device can act on today (derived from `listConfiguredInfraConnectors` output at claim-time, not stored redundantly) — used purely for routing eligibility, never for granting permission (permission still comes from `role_capabilities`, capability list only narrows *which* eligible-and-permitted device can usefully claim a given task).

An "agent" in PawOS is never separate from a human user — there is no concept of a headless, unattended Paw with its own login. Every Paw instance is one person's device. This is a deliberate scope boundary carried forward from the audit's own conclusion (§7 of the audit): PawOS is N individual copilots sharing a database, and V1 keeps that property rather than trying to simulate autonomous agents with independent identity.

### One Paw

Unchanged. No Orchestrator involvement — a solo user's Conversation Runtime works exactly as it does today.

### Ten Paws (a team/agency)

- A ticket/task enters `workspace_tasks` (already real, Phase 2) via any of: manual creation, `InvestigateTicketPlugin` auto-logging a finding as a follow-up task, or (new) a Jira/Linear webhook-equivalent — **out of scope for V1**, manual/plugin-created only; real external-tracker sync is a V2 item, named explicitly as missing rather than silently assumed.
- The task carries: `repository_id` (nullable), `required_capability` (nullable, e.g. `infra.deploy`), `status` (`open | claimed | in_progress | done | released`).
- Any team member's idle Paw, viewing the Orchestrator's "claimable tasks" list (a new small UI panel — likely a card in the existing Activity Dashboard, not a new top-level nav item, consistent with the "coherent unification" the audit praised about the Apps hub), sees only tasks where: (a) they hold the required capability, and (b) if `repository_id` is set, they have that repository configured locally (derived from `agent_capabilities`).
- Claiming a task hands its description straight into that user's own Conversation Runtime as if they'd typed/pasted the ticket themselves — **no new execution path, no new AI capability, just a new *source* of input to the exact same pipeline that already exists.**
- Investigation output (root cause, files touched, fix applied) is logged to `EngineeringMemoryStore` **and**, new in V1, mirrored to an org-shared table when the workspace context is set — see "Organization memory" below.

### One hundred Paws (enterprise engineering org)

Adds three things ten Paws doesn't need:

1. **Ticket routing rules** — reuse the existing generic `organization_policies` mechanism (no new table): a policy keyed `ticket_routing` with a value like `{"rules": [{"label": "payments", "assignTo": "team:payments"}]}`. When a task is created with a matching label, it's pre-filtered to only that team's members' claimable list rather than the whole org's — reduces noise, doesn't change the underlying claim mechanism.
2. **Load-aware display** (not load-aware *enforcement* — V1 doesn't block someone from claiming a fourth task, it just surfaces "you already have 3 open" so a human makes the call) — a small, honest addition, consistent with this codebase's "never fabricate certainty, surface real state" ethos found throughout the audit.
3. **Org-shared knowledge becomes load-bearing, not optional** — at 100 Paws, redundant investigation (two people root-causing the same recurring incident) is the real cost center. This is why "Organization memory" (below) is marked as required infrastructure for the 100-Paw case specifically, even though it's a nice-to-have at the 10-Paw scale.

### Paw-to-Paw communication — explicitly, permanently mediated, not direct

**Decision, stated plainly: PawOS V1 does not give one user's Paw a channel to talk to another user's Paw directly.** Every piece of "collaboration" is a human writing something (a task, a comment, an approval decision) that another human's Paw later reads as ordinary data. This is not a limitation being apologized for — it's the correct security boundary for a product whose own audit found no existing AI-to-AI protocol and no clear need for one: a live socket between two autonomous reasoning loops multiplies the blast radius of a prompt-injection or hallucination incident with no corresponding capability gained (everything two Paws might "say" to each other, a human can already read via the shared task/audit trail). If a future version wants real Paw-to-Paw negotiation, that is a deliberate, separately-scoped security review, not a V1 default.

### Task delegation, workspace/repository ownership

Already real (Phase 1–3). V1 adds only the claim-queue layer above. No change to how workspaces/repos/branch-ownership are recorded.

### Cross-device execution

**Explicitly does not exist and is not being built.** Restated for clarity since it's the item most likely to be misread as a gap: there is no "run this on someone else's machine while they're not looking" capability, by design, inherited unchanged from Phase 3's original architectural constraint. Claiming a task means *you* are about to do the work on *your* machine.

### Human approval

Reuses Phase 6's `organization_approval_requests` and `requires_approval()` mechanism, extended with new gate-able capabilities (`tasks.claim` for junior-role approval-gating, in addition to the existing `infra.deploy/rollback/promote`) — no new approval *system*, just new policy keys pointed at the same generic mechanism.

### Organization memory / shared knowledge — the one genuinely new backend piece

This is the concrete answer to the audit's "knowledge reuse is real but siloed" finding.

**New migration (V1, not yet built):**
```sql
create table organization_knowledge (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id),
  workspace_id uuid references organization_workspaces(id),
  kind text not null,              -- 'root_cause' | 'pr_review' | 'incident' | 'fix_pattern'
  entity_ref jsonb not null,       -- mirrors the shape already produced by EngineeringMemoryStore
  confidence text,                 -- reuses rootCauseEngine's own 'low'|'medium' vocabulary, never invents 'high'
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now()
);
```
RLS: same pattern as every other Phase 0–6 table (member-visible, capability-gated writes via a new `memory.org.write` capability). **This table is a mirror, not a replacement** — `EngineeringMemoryStore` stays the local, always-available source of truth; this is what gets consulted *before* starting a new investigation, so a second Paw sees "this exact error was already root-caused three weeks ago by a teammate" instead of redoing the work. `InvestigateTicketPlugin`/`InvestigateProductionIssuePlugin` gain one new step: query `organization_knowledge` first (when org context exists), surface any match to the model as retrieved context, and only run the full investigation if nothing relevant is found.

---

## Part IV — Coding Runtime V1

Builds on the audit's precise finding of what's real vs. missing (§3.1/§13 of the audit). V1 doesn't rearchitect the Coding Canvas UI or the plugin set — it closes three specific, named gaps.

| Stage | V1 design |
|---|---|
| Software engineering workflow | Unchanged — Coding Canvas's 10 sections, Go/Pro gate (renamed, not re-architected — see Part V naming fix). |
| Ticket investigation | Unchanged mechanism, **new first step:** query `organization_knowledge` (Part III) before investigating from scratch, when a workspace context exists. |
| Root-cause analysis | Unchanged — `rootCauseEngine`'s deterministic, confidence-capped correlation stays exactly as-is; this is a working, honest design and the audit found nothing to fix here. |
| Browser investigation | Unchanged — real CDP-driven console/network inspection via `DevBrowserManager`, already correct. |
| Code understanding | Unchanged — `ProjectAnalyzer` + coding-project memory graph entities. |
| **Automatic testing** | **The one real code gap the audit found.** Today: zero pre-deploy test gate exists in code; the "auto-fix loop" is prompt-level only. V1 design: `DeployProjectPlugin.prepare()` gains a new, honest step — if the target project has a detectable test command (already known via `TestResultParser`'s existing format detection) and org policy (or local preference, for Individual/Guest) has "require tests before deploy" enabled, run it and treat a failure as a `requires-confirmation`-class refusal (not a silent block) — the user can still explicitly override, consistent with this codebase's "never refuse a determined, informed user" pattern used everywhere else. **This is opt-in by default** (a new local preference, off by default for Individual/Guest to avoid breaking existing muscle memory; on by default for Team/Enterprise via a seeded `organization_policies` row, since a shared deploy target is exactly the situation where an untested deploy is riskiest). |
| Human approval | Unchanged local gate (`PendingApprovalStore`) plus, when governance policy demands it, the Phase 6 org-level gate — already correctly layered, no change needed. |
| Deployment | Unchanged — Vercel/Netlify real, others detection-only. Not expanding provider coverage in V1 — out of scope, named as a future item, not silently assumed. |
| **Learning from approvals** | **The second real gap.** V1 design: every decided `organization_approval_requests` row (and every local `PendingApprovalStore` resolution) gets logged into `EngineeringMemoryStore` with its capability + outcome. Before creating a new approval request, the system prompt is given a one-line retrieved summary — *"the last 3 requests to deploy this project were: approved, approved, denied (reason: outside business hours)"* — generated by simple aggregation (count + most-recent-denial-reason), not a model call, keeping with the codebase's existing deterministic-over-ML discipline. This does not auto-deny or auto-approve anything; it only informs the human/model of a real, checkable pattern. |
| **Knowledge reuse** | Same `organization_knowledge` table from Part III — Coding Runtime and Infrastructure Runtime share it, since a root cause and a code-fix pattern are the same *kind* of reusable fact. |

**Explicitly NOT part of Coding Runtime V1** (named so nobody assumes it's coming): a build matrix / CI pipeline replacement, multi-repo parallel task execution beyond what the Orchestrator's claim queue already provides, and any autonomous (un-claimed, un-triggered) ticket processing.

---

## Part V — Tier Audit

| Tier | Why it exists | Who buys it | Problem solved | Differentiation sufficient? | Naming correct? | V1 recommendation |
|---|---|---|---|---|---|---|
| **Go** | Zero-risk trial | Anyone evaluating PawOS | "Let me see if this is useful before I pay anything" | Yes — 0 models, 0 credits is a real, honest floor | Yes | No change. |
| **Pro** ($20) | Individual power user | Freelancers, solo devs | Real model access + advanced runtimes | Yes, relative to Go | Yes | No change. |
| **Pro Max** ($100) | *Intended* to be a higher-usage individual tier | Power users needing more than Pro | **Currently solves nothing Pro doesn't** — audit-confirmed code-identical | **No — the single clearest tier problem in the audit** | Name is fine *if* differentiation is added | **Give it a real lever tied to this very design: concurrency.** Pro can run one Coding/Infrastructure task at a time; Pro Max can run N in parallel locally (e.g. investigate a ticket while a separate deploy's post-deploy health-check is still running) — a real, technically meaningful, individually-priced upsell that didn't exist before this design introduced a queue/claim concept even for a single-user context. |
| **Team** ($20/seat) | Org collaboration for small-to-mid groups | Startups, agencies (2–150 seats) | Shared workspaces, RBAC, credit pools | **Partially — currently near-identical to Enterprise in real capability, per Part V finding below** | Yes | Pull `approvals.decide`/`sso.manage`/broad `credentials.manage` off the generic `owner` seed (see next row) so Team's real feature set is visibly smaller than Enterprise's, not just seat-range-smaller. |
| **Enterprise** ($100/seat) | Governance/compliance for large orgs | Companies/enterprises (20+ seats) | SSO, governance policies, audit export, dedicated admin roles | **No — the audit's own finding, confirmed independently twice:** two of Enterprise's seven roles (`itAdministrator`, `securityAdministrator`) do nothing, and Team's `owner` already gets most of what should be Enterprise-exclusive | Yes | **Two-part fix:** (1) give `itAdministrator` real capabilities (`infra.credentials.manage`, `infra.deploy` oversight/approval) and `securityAdministrator` real capabilities (`audit.view`, `policies.manage`, `approvals.decide`, `sso.manage`) instead of granting those to the generic owner role; (2) this single change simultaneously fixes the "dead roles" problem *and* the "Team = Enterprise" problem, since those capabilities move off a role Team also has (`owner`) onto roles that only exist at Enterprise tier. |

**One additional naming note carried from the audit:** the local Coding-mode `go`/`pro` toggle (`CodingModeStore`) must be renamed before V1 ships anything else — it is unrelated to subscription tiers but shares their exact vocabulary. Recommend `restricted`/`unrestricted`, or verb-based (`investigate`/`execute`, matching `InfraModeStore`'s own existing verb style for consistency between the two sibling toggles).

---

## Part VI — Complete User Journey Audit

| Stage | Individual | Startup (5) | Team (20) | Enterprise (1000+) |
|---|---|---|---|---|
| Onboarding | Real, resumable, correct persona fit | **Never mentions org/team creation — critical gap** | Same gap, worse at scale | Same gap; an Enterprise buyer's first-run experience is identical to a solo trial user's |
| Navigation | Sidebar fits well | Org buried in Settings→Account (audit's top finding) | Same | Same, plus no department/multi-team navigation concept exists at all |
| Workspace creation | N/A | Real once discovered, via Organization Runtime | Real | Real, but no bulk/templated workspace creation for many teams at once |
| Organization creation | N/A | Real, domain-restricted invite works correctly | Real | Real, single-org-per-user assumption never tested against large multi-subsidiary structures |
| Runtime discovery | Apps hub is genuinely good | Same Apps hub, but zero org-awareness — no "shared with your team" indicator anywhere in Office/Browser/Coding runtimes | Same | Same |
| Collaboration | N/A | Communication Runtime real; Office/Browser have no org-sharing at all (audit finding) | Same | Same, plus at scale the lack of org-shared knowledge (Part III) compounds noticeably |
| Deployment | Real, local | Real, local-only — **no team visibility into "someone else is deploying this right now"** even though Phase 4 presence infrastructure already exists and could show it cheaply | Same | Same, at higher blast-radius |
| Administration | Settings, fine | **Org admin and personal account settings are the same page** — a real UX smell: "manage my company" should not visually be a card inside "edit my profile" | Same | Same, plus **no adoption/usage dashboard exists** — an Enterprise admin has no way to see "how many of our 1000 licenses are actually active" |

**Missing experiences, ranked:**
1. An organization-creation step in onboarding (skippable, but present) — directly closes the #1 audit finding.
2. A dedicated "Organization" area distinct from "My Account" in Settings navigation (same data, different visual home — a low-cost restructure, not new backend).
3. Team-visibility for Office/Browser Runtime artifacts (extend the existing `OrgSyncBridge` pattern Communication Runtime already proved out).
4. A live "who's deploying/working right now" presence strip for Team/Enterprise, reusing Phase 4's already-built presence channels.
5. An Enterprise adoption/usage dashboard (seat activity, last-active-per-member) — genuinely new, but small: it's a read-only view over data (`device_sessions`, `audit_log`) that already exists.

---

## Part VII — Final V1 Roadmap

| Subsystem | Status |
|---|---|
| Conversation / Reasoning / Execution Runtimes | **Complete** |
| Coding Runtime (core workflow) | **Complete** |
| Coding Runtime — pre-deploy test gate | **Missing** (Part IV) |
| Coding Runtime — learning from approvals | **Missing** (Part IV) |
| Browser Runtime | **Complete** |
| Communication Runtime (desktop capture, transcription, org-sharing) | **Complete** |
| Communication Runtime (phone/mobile capture) | **Partially complete** — architecture only, no mobile client |
| Office Runtime (local file creation) | **Complete** |
| Office Runtime (cloud connectors) | **Missing** — and per Part I, the unpopulated registry should be deleted, not filled, for V1 |
| Companion Runtime | **Complete** |
| Infrastructure Runtime (connectors, investigation, deploy) | **Complete** for GitHub/GitLab/Linear/Jira/Vercel/Netlify |
| Memory & Knowledge Runtime unification | **Partially complete** — graph exists and is the right target; flat-store consolidation not started |
| Organization Runtime (Phases 0–5) | **Complete, approved, frozen** |
| Organization Runtime (Phase 6 — governance/vault/SSO) | **Partially complete** — implemented, typechecked, migration applied; live verification outstanding |
| Organization memory / shared knowledge | **Missing** (Part III) — new migration + two call sites |
| Orchestrator Runtime (claim queue, ticket routing) | **Missing** — entirely new for V1 |
| Tier rebalancing (Pro Max differentiation, Enterprise role capabilities) | **Missing** — data/seed change, no new architecture |
| Naming fixes (go/pro collision, approval-system naming) | **Missing** — trivial, cheap |
| Onboarding org-creation step | **Missing** |
| Settings navigation restructure (Organization vs My Account) | **Missing** |
| Cross-runtime org-sharing (Office/Browser) | **Missing** |
| Presence strip for infra/deploy activity | **Missing** — mostly reuses Phase 4 |
| Enterprise adoption dashboard | **Missing** |
| Website — pricing/marketing pages | **Complete** |
| Website — checkout end-to-end (Razorpay live, webhook persistence) | **Missing/broken** — every piece exists, path doesn't function today |
| Website — dashboard/account management | **Missing by design** — confirmed correct scope (Electron-only), not a gap |
| Website — documentation parity with in-app Help Center | **Missing** |
| Production deployment (backend/desktop/website/Supabase prod config) | **Not started** |
| Production acceptance testing | **Not started** |

---

## Part VIII — Final Implementation Order

Ordered by dependency and leverage, not by section order in this document:

1. **Naming fixes** (go/pro collision, approval-system naming) — zero architectural risk, immediate clarity gain, should happen before anything else touches these areas.
2. **Tier/role capability rebalancing** (Pro Max concurrency semantics deferred to step 6; Enterprise role capabilities is a pure data/seed change) — fixes the audit's clearest "looks done, isn't" finding at near-zero engineering cost.
3. **Onboarding + Settings navigation restructure** — the single highest-leverage UX fix (audit D1/D6), purely front-end, no backend change, unblocks every subsequent Team/Enterprise-facing improvement by making the existing platform discoverable.
4. **Coding Runtime V1 gaps** (pre-deploy test gate, learning-from-approvals) — self-contained, no dependency on anything else in this list.
5. **Cross-runtime org-sharing for Office/Browser** — extends a proven pattern (`OrgSyncBridge`), no new architecture.
6. **Organization memory / shared knowledge** (new migration) + **Pro Max concurrency** — these share a dependency (both benefit from the same "more than one thing can be in flight" concept), do together.
7. **Orchestrator Runtime** (claim queue, ticket routing) — depends on nothing built earlier being *required*, but is far more valuable once org-shared knowledge (step 6) exists, so it comes after.
8. **Presence strip + Enterprise adoption dashboard** — polish-tier, do last among the architectural items since neither blocks anything else.
9. **Website checkout fix + documentation parity** — per the existing governing sequence, website work proceeds only after the desktop/architecture roadmap above is accepted and complete.
10. **Production deployment + acceptance testing** — final gate, unchanged from the original instruction sequence.

---

*End of design document. No code was written or modified. Awaiting explicit approval before any architectural or implementation change proceeds.*
