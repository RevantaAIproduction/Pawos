# PawOS Final Pricing & Business Model Audit

**Status: PRICING AUDIT ONLY.** No architecture, runtime, product, or navigation change is proposed or implied anywhere in this document — all three prior documents (`PAWOS_ARCHITECTURE_AUDIT.md`, `PAWOS_V1_ARCHITECTURE.md`, `PAWOS_PRODUCT_ARCHITECTURE.md`) are treated as accepted and unchanged. This document evaluates only the commercial model: pricing, packaging, sustainability, and customer perception. **Awaiting approval before any billing/commercial change is implemented.**

Note on scope: the proposal names Jira as an example ticket source; the workflow's own step list ("Reading Jira/GitHub/Linear/Azure DevOps tickets") already establishes multiple trackers, and this audit treats the billable workflow as tracker-agnostic throughout — indeed, that genericity is one of the drivers behind the naming recommendation in §5.

---

## The one fact from the accepted architecture that changes this audit's whole shape

Per the accepted V1 architecture, **execution always happens locally, on the customer's own machine** — PawOS never runs its own cloud compute/sandbox to perform the build, test, or deploy steps of an autonomous workflow. This means PawOS's actual marginal cost per Autonomous Ticket Resolution is dominated by **LLM API token cost**, not infrastructure/compute cost. This is a materially different cost structure from a competitor like Devin/Cognition, which runs its own agent sandboxes and therefore bears real compute cost per task regardless of what model it calls. Every answer below is shaped by this: PawOS can sustain a lower, more stable per-unit price than a cloud-execution competitor, but it also means the *variance* in cost is concentrated entirely in token usage (context size, retry count, model choice), which is exactly the variance a flat $5 price doesn't yet account for.

---

## 1. Is this commercially sustainable?

**Yes, structurally — but not yet safely, as a flat unmetered-variance price.** The instinct to meter the one operation with unbounded, variable compute cost while including everything else (chat, research, documents — all comparatively cheap and bounded per use) is the correct shape, and it mirrors how every successful usage-based SaaS in this space prices (see §7). The risk isn't the *model*, it's the *flatness*: a one-line config fix and a multi-file refactor requiring several investigation-and-retry cycles both cost $5, but do not remotely cost PawOS the same amount in tokens. Sustainable in aggregate across a large enough customer base (the cheap tickets subsidize the expensive ones), but exposed at the tail — a customer whose workload skews toward large, complex tickets could be running at negative margin per unit while paying the advertised price, with no mechanism today to detect or correct that before it accumulates.

## 2. Is $5 the correct price?

**Reasonable as a launch anchor for a typical/median ticket, not defensible as a permanent flat rate for every ticket.** Recommend shipping at $5 but explicitly, internally, as a *provisional* launch price pending real usage data — the contract language (for both self-serve Professional Teams and negotiated Enterprise) should reserve the right to adjust as actual cost distribution becomes known, exactly as any usage-based vendor does in its first year. Do not lock $5 into marketing as a permanent guarantee before there is a real distribution of ticket sizes to price against.

## 3. Should each subscription include a monthly allowance before metered billing begins?

**Yes — this is not optional if the plan is to be marketed as "everything included."** Advertising "everything included" and then charging from the very first unit of the one thing that isn't reads as a bait-and-switch, regardless of how clearly the exception is documented in fine print. A nonzero included allowance is also standard practice in every comparable hybrid-pricing product (see §7 — GitHub Copilot's premium-request allowance is the closest direct precedent) and creates the natural expansion-revenue signal every consumption business relies on: a customer exceeding their allowance is your best-qualified upsell lead, not a support ticket waiting to happen.

## 4. Should Professional Teams and Enterprise have different included allowances?

**Yes.** Enterprise already negotiates a custom base subscription and volume-discounted per-unit rate, per the existing proposal — a larger (or fully custom-negotiated) included allowance is a natural, low-cost extension of that same "we treat you as a larger, more trusted account" commercial relationship, and reinforces the Enterprise tier's actual value proposition (governance, trust, scale) rather than competing with it. Recommend: Professional Teams gets one clearly published number (small, so real usage data can be gathered before it's raised); Enterprise's allowance is part of the negotiated contract, not a public figure.

## 5. Is "Autonomous Ticket Resolution" the correct commercial unit?

**No — recommend renaming to "Autonomous Engineering Task," with "Completed Autonomous Engineering Task" as the specific billable event.** Evaluating the options given:

- *"Ticket Resolution"* — ties the billable event to the existence of a ticket in an external tracker. As already flagged, the actual workflow doesn't require one (a founder asking Paw directly to "fix this bug" with no Jira/Linear/GitHub Issues/Azure DevOps involved triggers the identical workflow) — this name would confuse exactly the customers least likely to have a formal tracker, which skews toward the individual/startup-founder end of the customer base, i.e., precisely the segment most price-sensitive and most likely to misjudge what they're being charged for.
- *"Engineering Run"* — "Run" collides with existing CI/CD vocabulary (GitHub Actions runs, CI runs) that developers already associate with commodity, sub-cent-feeling compute — undersells a unit meant to represent substantial completed engineering labor.
- *"Autonomous Resolution"* — drops the ticket-dependency problem but keeps a bug-fix connotation ("resolution" implies something was broken) that doesn't fit the equally-real case of autonomously building something new.
- *"Engineering Workflow"* — accurate but vague, and risks blurring the line with the *included*, non-billable "workflow" of ordinary chat-assisted coding — the word doesn't itself signal "this is the metered one."
- *"Completed Work Item"* — closest of the four given options: "completed" correctly foregrounds the success-gating rule, "work item" is domain-neutral. Weakness: "work item" is Azure DevOps's own native noun for a ticket, which re-introduces a faint tracker-specific echo the name is trying to avoid.

**Recommended final name: "Autonomous Engineering Task."** "Engineering" scopes it correctly (excludes chat/research/documents by name alone, reducing the need to explain the boundary — see §6), "Task" is tracker-agnostic, evokes bounded assignable work a customer already thinks in terms of ("I gave it a task"), and pairs cleanly with the success rule: *"You're billed only for Autonomous Engineering Tasks that complete successfully."* This sentence should be the primary pricing-page copy.

## 6. Can customers clearly understand this pricing?

**The structure is understandable; two specific wordings currently undermine that clarity and should be fixed before launch.**

- Fix the "included beyond the plan allowance" phrasing to state a real, nonzero number (§3) — "included, then metered beyond N per seat per month" is unambiguous; "included but billed from the first one" is not, and reads as contradictory.
- Lead with the success-gated billing rule as a **customer-facing selling point**, not a footnote: *"You never pay for an Autonomous Engineering Task that fails, is cancelled, hits a retry limit, or is denied approval — only for one that actually completes."* This is a genuine, checkable, differentiated claim (see §7) and is currently buried in the "billing rules" fine print where it does no marketing work at all.
- Ship a real-time usage view as part of the existing Organization/account-management surface (not a new nav destination, per the accepted product architecture — an addition to a job that already exists): a running "X of Y Autonomous Engineering Tasks used this month" counter, and a visible signal *before* an autonomous workflow starts that it may count as one, so nothing is a surprise after the fact.

With those three fixes, yes — a customer should immediately understand what's included, what's metered, and what's never charged, because the structure itself (flat subscription + one clearly-named metered exception + success-gated billing) is genuinely simple; the current wording is the only thing standing in the way of that clarity.

## 7. Comparison to market structures (structure, not price)

| Company | Structural pattern | What PawOS should take from it |
|---|---|---|
| **GitHub Copilot** | Flat per-seat subscription + included allowance + metered overage specifically on advanced/agentic usage | **The closest direct precedent for PawOS's exact shape.** Validates that seat-plus-metered-exception is a market-proven structure, not a novel risk. |
| **Cursor** | Subscription + usage-based compute, but has publicly changed how "requests" are counted more than once, causing real customer confusion/backlash | **Cautionary lesson: define the billable unit once, precisely, and do not redefine it after launch.** Retroactive changes to what counts as billable are the single fastest way to damage trust in a usage-based model. |
| **Devin / Cognition** | Priced on Agent Compute Units — consumption/attempt-based, billed whether or not the task fully succeeds | **The key structural contrast, and PawOS's real differentiator.** PawOS's success-gated billing (§6) is a genuine, defensible advantage over "pay for the attempt, not the outcome" — this comparison should appear in competitive marketing materials directly. |
| **Linear / Jira** | Pure per-seat SaaS, no usage meter at all | Validates the *base* subscription shape (Professional Teams' per-seat price) but offers no precedent for the metered layer — these products have no equivalently heavy, variable-cost primitive to meter. |
| **Snowflake** | Pure consumption (compute-credits), no seat pricing | The opposite extreme from Linear/Jira — useful only to confirm PawOS is right *not* to go fully consumption-based, since PawOS also has genuinely light, frequent, seat-shaped usage (chat, research, documents) that a pure-consumption model would price badly. |
| **Datadog** | Usage-based pricing across many separate metered dimensions (hosts, custom metrics, logs, etc.), infamous for bill-shock as metrics proliferate | **Cautionary lesson: meter proliferation is the risk, not the first meter itself.** Keep PawOS to exactly one metered unit for V1. Resist the natural organizational pressure to later meter "extra browser research minutes" or "extra deploys" as separate line items — if a second meter is ever justified, it must clear the exact same transparency bar set for the first. |
| **Twilio** | Pure per-event consumption (per SMS/call-minute) with volume-discount tiering; unit is small, self-evident, and universally uniform (a text message is a text message) | **The closest precedent for the metered unit's shape, and the source of PawOS's biggest remaining structural risk.** Unlike an SMS, an Autonomous Engineering Task is not a uniform unit — task size/complexity varies enormously (§1/§2). Twilio's clarity comes from unit uniformity PawOS does not yet have; closing that gap (via complexity tiering, or firm scope discipline on what counts as "one" task) is the single highest-leverage structural fix available. |

**Overall structural verdict:** PawOS's proposal is closest in shape to **GitHub Copilot's** model, with a genuine, marketable advantage over **Devin's** (success-gated vs. attempt-gated billing), and should treat **Cursor's unit-redefinition history** and **Datadog's meter proliferation** as the two specific failure modes to design against from day one.

## 8. Can this scale from 5 → 50 → 500 → 5,000 developers without redesign?

**Yes, the pricing model's shape holds at every size — what changes with scale is reporting/visibility tooling, not the model itself.**

- **5 developers:** trivial — flat seat price, small allowance, no friction.
- **50 developers:** metered overage starts to matter; needs a usage dashboard scoped to the org (an addition to the existing account-management surface, not a new pricing mechanism).
- **500 developers:** needs team/department-level budget visibility and simple threshold alerts ("Team X is on pace to exceed its allowance") — again, reporting on top of the existing model, not a different model.
- **5,000 developers:** this is squarely Enterprise-tier territory as already proposed (custom base + negotiated volume rate) — the model is explicitly built for this scale already; what's needed is ordinary enterprise commercial machinery (invoicing, true-up reconciliation, contractual volume breakpoints), not a pricing redesign.

**One gap worth naming:** there is currently no defined path for a large team (e.g., 150–300 seats) that hasn't formally moved to an Enterprise contract. Recommend adding a published volume-discount tier *within* Professional Teams (e.g., a lower per-unit rate above a stated monthly-task-volume threshold) so a growing team has a natural next step rather than either overpaying retail per-unit rates indefinitely or being forced into a full enterprise sales negotiation earlier than the team is ready for.

## 9. Loopholes customers could exploit

Billing here is success-gated, so the exploit direction is the reverse of typical usage-gaming: customers are incentivized to obtain the outcome *without* triggering the specific event that bills them, not to trigger it needlessly.

1. **Deploy-boundary dodge (the most concrete, fixable loophole).** The workflow's own step list includes "Deploying (if approved)" as part of what a resolution may involve. If billability is contingent on PawOS itself performing the final deploy step, a customer can let the autonomous workflow do all the expensive work (investigation, root-cause, code, tests, PR) and then simply merge/deploy manually outside PawOS, capturing the outcome while dodging the charge. **Recommendation: define the billable "success" state at PR-ready-and-ticket-marked-resolved, explicitly independent of whether Paw itself performs the subsequent deploy** (deploy is already optional/human-approved regardless, per the existing architecture, so tying billability to it also creates an unnecessary dependency on an unrelated approval step, not just a loophole).
2. **Mode-avoidance (the largest, but least fixable without breaking the product's own philosophy).** Because ordinary chat-assisted coding stays included and unmetered no matter how extensively used, a sophisticated customer could always stay in assisted/manual mode and hand-orchestrate the same investigate→fix→PR sequence one chat message at a time, never entering the metered "autonomous" state at all. **Recommendation: accept this as a known, monitored trade-off rather than attempt to meter by outcome regardless of mode** (which would contradict the product's own "manual/assisted work is always included" commitment) — in practice, most customers who would benefit from autonomy will pay for the convenience of not doing this by hand; watch usage data at renewal time for organizations whose usage pattern looks like deliberate mode-avoidance, and treat it as an account-health/expansion-conversation signal, not a billing-enforcement problem.
3. **Retry-limit timing dodge.** Since hitting the retry limit is explicitly non-billable, a customer watching a task trend toward success could manually cancel it just before completion, then finish the last small step by hand. Same root cause and same fix as #1 — moving the success-definition boundary earlier (to PR-ready) rather than to the very last, most easily-dodged step reduces the window for this considerably, since most of the expensive work has already happened by the time a PR is ready.
4. **Seat-sharing** — a general SaaS risk, not specific to this pricing addition; not addressed further here since it's orthogonal to the metered unit.

## 10. Final recommended commercial model for PawOS V1

- **Keep** the flat subscription structure exactly as proposed: Go / Pro / Pro Max individually, Professional Teams / Enterprise for organizations.
- **Rename** the billable unit to **Autonomous Engineering Task**, billed as "Completed Autonomous Engineering Task" (§5).
- **Add** a nonzero, clearly published monthly allowance per seat for Professional Teams; a custom/negotiated allowance for Enterprise (§3/§4).
- **Redefine** the success-gate boundary to trigger at PR-ready-and-ticket-reported, not contingent on Paw performing the deploy step, closing the clearest loophole while also removing an unnecessary dependency on an unrelated approval step (§9).
- **Launch** at $5/unit for Professional Teams overage as a provisional price, contractually reserved for adjustment once real cost-distribution data exists (§1/§2); add a published volume-discount tier within Professional Teams for large non-Enterprise teams (§8).
- **Ship** a usage-transparency view (allowance consumed, running task count, pre-task notice) as part of the existing account/organization surface — required for genuine customer clarity, not optional polish (§6).
- **Discipline:** exactly one metered unit for V1. Do not add a second meter without clearing the same transparency bar as the first (§7, Datadog lesson); do not redefine what counts as one unit after launch (§7, Cursor lesson).
- **Lead marketing** with the success-gated billing rule as a named competitive differentiator against consumption-billed competitors like Devin — this is a real, checkable advantage and currently the least-used asset in the whole proposal.

**Suitability for investors, enterprise customers, and long-term scaling:** with the five changes above (naming, allowance, success-boundary redefinition, provisional-price framing, and usage transparency), this model is a defensible, market-precedented (GitHub Copilot-shaped) pricing structure with a genuine, marketable differentiator (success-gated billing) against the most direct competitive threat (Devin-style consumption billing), a clear and already-designed path to enterprise scale, and no structural blocker to reaching 5,000+ seats. The unresolved risk to disclose plainly to investors is unit-cost variance (§1/§2, §7-Twilio) — not a flaw in the model's shape, but an open question that should be answered with real usage data within the first pricing review cycle rather than assumed away.

---

*End of pricing audit. No code was written or modified. Awaiting explicit approval before any commercial/billing implementation begins.*
