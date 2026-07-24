# PawOS Product Architecture — Jobs, Customers, and Monetization

**Status: DESIGN ONLY.** This document deliberately sets aside runtime names and internal architecture (both already accepted in `PAWOS_ARCHITECTURE_AUDIT.md` and `PAWOS_V1_ARCHITECTURE.md`) and re-derives the product from what a paying customer is actually trying to get done. Runtime architecture reappears only at the end, as the *implementation* of the jobs defined here — not the other way around. **Awaiting approval before any implementation begins.**

---

## Part I — Capabilities Reframed as Jobs

Every technical runtime maps to zero, one, or a fraction of a "job" a real customer would describe in their own words. This section evaluates each job on its own terms, then decides what — if anything — needs merging.

### Job: Build Software
*"I want to write, fix, and ship code without doing the mechanical parts myself."*

- **Why pay:** the single highest-willingness-to-pay job in the product — it's the one where PawOS directly replaces hours of a developer's own time, not just assists.
- **Who needs it:** individual developer, freelancer, startup founder (often the same person as the developer), agency, engineering team, enterprise.
- **How often:** daily, often continuously, for anyone who codes.
- **Merge candidates:** *Deploy* is not a separate job — it's the last step of Build Software. No customer describes "I want to deploy" as a distinct desire from "I want to ship this feature"; keeping it a distinct nav item would fragment one continuous action into two. *Fix Production Issues* is related but should stay separate (see below) — different urgency, often a different person (SRE/on-call vs. feature developer), different emotional register (crisis vs. flow state).
- **Visibility today:** buried under "Coding Canvas" and a Go/Pro gate whose name collides with the pricing tier of the same name — actively *hides* value rather than surfacing it. **This job needs a rename and a promotion, not new engineering.**

### Job: Fix Production Issues
*"Something is broken right now and I need to know why, fast."*

- **Why pay:** high emotional stakes (an incident is stressful and expensive) make this one of the easiest jobs to justify a subscription for, even for a customer who doesn't code daily otherwise.
- **Who needs it:** engineering team, agency (managing client infra), enterprise (SRE/on-call), occasionally startup founders wearing every hat at once.
- **How often:** bursty — rare for a healthy week, critical the moment it's needed. A job's *value* is not proportional to its frequency; this is the clearest example in the whole audit.
- **Merge candidates:** genuinely distinct from Build Software — a different mental mode (root-cause, not feature-building), already backed by real, distinct tooling (root-cause engine, browser/console investigation). Keep separate.
- **Visibility today:** exists only inside the Infrastructure Canvas, discoverable only by someone who already knows to look for "Infrastructure." **This job's real, honest, working root-cause tooling is the best-kept secret in the product** — it should be one of the most prominently named jobs, not the most hidden.

### Job: Research
*"I need to find, compare, or extract something from the web."*

- **Why pay:** saves real time on comparison shopping, competitive research, gathering references — a broad, low-stakes-per-use but very frequent job.
- **Who needs it:** every persona, including non-engineers (student researching a topic, agency comparing vendors, product team scoping a market).
- **How often:** very frequent, short bursts.
- **Merge candidates:** "Search" was never a separate capability (confirmed in the technical audit) and should never be a separate *job* either — it's a mode of Research, not its own nav destination.
- **Visibility today:** reasonably discoverable via the Apps hub, but not obviously "for everyone" — its current framing (`Research`, tucked next to `Development`/`Cloud`) reads as an engineering tool rather than a general-purpose one. **Reframe the copy, not the mechanism.**

### Job: Meetings
*"Capture and remember what happened in a call so I don't have to take notes."*

- **Why pay:** directly competes with dedicated tools (Otter, Fireflies, Fathom) that customers already pay for — a clear, comparable willingness-to-pay exists in the market.
- **Who needs it:** freelancer, agency, product team, startup founder, engineering team (standups/retros), less so a student.
- **How often:** as often as the customer has meetings — daily for most professional personas.
- **Merge candidates:** could be merged with *Documents* under one "Communicate & Document" umbrella, but meetings is recognizable enough as its own job in the market (customers already have a category label for it) that splitting it out is clearer, not more confusing.
- **Visibility today:** real and functional, reasonably discoverable, but undersells itself by not being positioned against the tools customers already know and compare against.

### Job: Documents
*"Create or edit a document/spreadsheet/presentation without opening a specific app."*

- **Why pay:** time saved on mechanical document assembly (a real spreadsheet with real formulas, a real deck with real charts) rather than dictating content into an existing app.
- **Who needs it:** product team, agency, freelancer, startup founder — less central for a pure engineering team.
- **How often:** frequent but bursty (a document gets created, then isn't touched again for a while).
- **Merge candidates:** stays its own job — distinct output type from everything else, distinct audience (non-engineers lean on this more than engineers do).
- **Visibility today:** functional but the *lack* of cloud-connector reach (no Google Drive/Microsoft 365) is a real, disclosed limitation that will surface in customer conversations for this specific job more than any other — because Documents customers are exactly the people most likely to already live in Drive/365.

### Job: Support Customers
*"Help me respond to and resolve what my own customers are asking."*

- **Why pay:** high value if it existed — every business with customers needs this.
- **Who needs it:** agency, product team, startup founder, enterprise support orgs.
- **How often:** would be daily/continuous if it existed.
- **Merge candidates:** N/A — **this job does not exist as a coherent capability today.** Email Follow-up (Communication Runtime) and drafting/compose-window behavior are adjacent pieces, but there is no ticket-inbox, no customer-conversation-history, no "draft a reply to this support request" workflow distinct from a general meeting-summary email. **This is the clearest capability gap in the entire product relative to what customers with customers of their own would expect.**
- **Recommendation:** do not claim this job exists in V1 marketing. It is a real, well-scoped V2 opportunity (see Part V) — the underlying pieces (Communication Runtime's capture/CRM, Office Runtime's draft-compose pattern) are close enough that this could ship faster than most other gaps once prioritized.

### Job: Manage Organization
*"Set up my team/company in PawOS: who's in it, what they can do, what it costs, what happened."*

- **Why pay:** this is the job Team/Enterprise tiers exist to sell — but customers don't pay to *do* this job, they pay so the *other* jobs above work correctly across a group of people. It is infrastructure for the other jobs, not a job in itself in the way "Build Software" is.
- **Who needs it:** anyone with more than one person using PawOS together — startup founder (once they hire), agency, product team, engineering team, enterprise.
- **How often:** rare per-action (invite someone, change a role) but constantly *relied upon* in the background.
- **Merge candidates:** stays its own destination (Settings-adjacent, admin-facing) — but per the V1 technical design, it must stop being literally nested inside "my personal account" navigation.
- **Visibility today:** the audit's single largest finding — real, substantial, effectively invisible.

### What is *not* a job — and correctly should never be a nav destination

- **Companion/personality customization** is retention and delight glue, not a job-to-be-done. A customer doesn't wake up needing "to customize my companion" the way they need "to fix a production issue." It stays exactly where it is (Companion Studio, reachable but not primary), and this document does not recommend promoting it to job-level prominence.
- **Memory/Knowledge** is invisible infrastructure that makes every job above better over time ("Paw remembers my project," "Paw already knows this root cause"). It should never appear as a nav item — its entire value is in *not* requiring the customer to think about it.
- **Devices/Security/Billing/Preferences** are account hygiene, correctly living in Settings, not jobs.

---

## Part II — Customer-Type Evaluation

For each: first action, retention driver, payment trigger, referral trigger.

| Customer | First thing they do | What makes them stay | What makes them pay | What makes them recommend |
|---|---|---|---|---|
| **Student** | Ask Paw to explain or research something for a class | The companion feels approachable, free tier genuinely useful for light research/writing | Rarely — this is the segment least likely to convert; free/Go tier retention matters more than Pro conversion here | "It helped me understand X" — word of mouth in study groups, not paid referral |
| **Individual developer** | Ask Paw to fix a bug or explain a codebase | Build Software actually works end-to-end, fast, without micromanaging it | Hits Go's model/credit ceiling within days of real use | "It shipped a real PR for me" — the single strongest organic-growth story available in this product |
| **Freelancer** | Ask Paw to draft a client deliverable (doc, or code) | Documents + Build Software both being useful to the same person, in the same tool, without context-switching | Needs Meetings/Documents for client work, not just code — converts on breadth, not depth | "It's my whole toolkit, not just a coding assistant" |
| **Startup founder** | Ask Paw to build/deploy the first version of something | Build Software + Fix Production Issues covering them solo before they can afford a real engineer | Converts fast once real usage starts (they have no time to waste); **churns hard if Manage Organization isn't discoverable the moment they hire person #2** | "It scaled from just-me to my-team without switching tools" — *only true if the org-discovery gap from Part VI of the V1 doc is fixed* |
| **Agency** | Ask Paw to research a client's competitor, or draft a client document | Meetings + Documents + Research covering client work; Manage Organization once they have a team | Pays for Team tier specifically for shared client knowledge (CRM-style contact/company memory) | "It handles client work end-to-end, not just internal dev work" |
| **Product team** | Ask Paw to summarize a meeting or draft a spec doc | Meetings + Documents + (once it exists) Support Customers | Pays for Team once more than one PM/designer needs shared visibility into decisions/research | "Everyone on the team sees the same customer/meeting history" |
| **Engineering team** | Assign or investigate a real ticket | Fix Production Issues + Build Software working reliably, plus (once shipped) real ticket-claim coordination across the team | Pays for Team/Enterprise specifically for shared engineering knowledge (root causes, PR reviews) not being re-discovered by every engineer independently | "It caught something a teammate already knew but I didn't have to ask them" |
| **Enterprise** | IT/security evaluates governance, SSO, audit export before any engineer even opens the app | Real audit trails, real (not label-only) admin roles, real approval chains | Pays for Enterprise specifically for compliance evidence and governance controls, not for more AI capability than Team already has | A security/compliance review that passes without exceptions — enterprise referrals happen procurement-to-procurement, not developer-to-developer |

**Cross-cutting finding:** every paying persona above converts on a *job actually working end-to-end*, not on a feature list. Every recommendation trigger is a specific, nameable outcome ("it shipped a PR," "it caught something a teammate knew"), never "it has a lot of tools." This directly supports Part III's recommendation.

---

## Part III — Navigation: Jobs, Not Runtimes

**Verdict: yes, primary navigation should be jobs, not runtime names.** The evidence is already in the accepted audit: the Apps hub (today's closest thing to a jobs-based surface) was the one piece of navigation the audit praised as "genuinely coherent," while the audit's single largest finding was that the highest-value shared capability in the product (Manage Organization) is invisible specifically *because* it's filed under an internal-sounding label rather than a customer-facing one.

### Final navigation architecture

```
Sidebar (primary — jobs, not runtimes):
  Home                    (today's OverviewSection — unchanged)
  Talk with Paw           (unchanged — the conversational entry point to every job below)
  Build Software          (was: Companion Studio... no — was: "Development"/Coding Canvas)
  Fix Production Issues   (was: "Cloud"/Infrastructure Canvas)
  Research                (was: "Research"/Browser Runtime — copy reframed, same mechanism)
  Meetings                (was: "Communication"/Communication Runtime, meetings-specific view)
  Documents               (was: "Office"/Office Runtime)
  [Support Customers — V2, not shown until it's real]

Sidebar (secondary, unchanged — these are histories, not jobs):
  Work History
  Conversation History

Sidebar (new, promoted — was invisible, now a primary destination for anyone in a team):
  Organization            (was: a card inside Settings → Account)

Footer (unchanged mechanism, renamed where needed):
  ProfileMenu → Companion Studio, Settings, Language, Help, Upgrade, Log out
```

**What explicitly does NOT change:** the underlying runtime code, plugin catalog, and Execution Runtime dispatch — this is a navigation/copy/information-architecture change, not a rewrite. `AppsHubSection`'s tiles get relabeled to match the job names above (Development → Build Software, Cloud → Fix Production Issues, etc.) and Organization gets promoted from a Settings card to a sidebar item, with Settings → Account keeping only genuinely personal account data (profile/password/devices).

**One explicit non-recommendation:** do not rename the *internal* code/file/class names to match (i.e., don't go rename `DesktopExecutionEngine` or `InfrastructureConnectorRegistry`) — those names are correct at the engineering layer and were explicitly validated in the accepted V1 technical architecture. This document only changes what a customer sees, never what an engineer reads in the codebase.

---

## Part IV — Final Monetization Strategy

Reframed around jobs unlocked and coordination unlocked, not feature counts.

| Tier | What it unlocks, in job terms | Why someone at that willingness-to-pay level buys it |
|---|---|---|
| **Go** (free) | Try every job, lightly, alone | Zero-risk trial of the whole product, not a crippled demo of one job |
| **Pro** ($20) | All jobs, unlimited, alone | "I use this daily for real work, by myself" |
| **Pro Max** ($100) | All jobs, unlimited, **and more than one at once** (e.g., Fix Production Issues while Build Software's post-deploy check is still running) | "I do enough in parallel that waiting for one job to finish before starting another costs me real money" — ties directly to the concurrency lever defined in the V1 technical design, now stated in outcome terms a customer would actually say out loud |
| **Team** ($20/seat) | Everything Pro Max unlocks, **shared**: the same job, done by multiple people, seeing each other's Research/Meetings/Documents/Build-Software history and knowledge | "My team stops re-doing work someone else already did" |
| **Enterprise** ($100/seat) | Everything Team unlocks, **governed**: approval chains before a job can proceed, audit evidence of every job ever run, SSO, a real credential vault, and admin roles that can actually restrict *who* can do *which* job | "I can prove to my security team and auditors exactly who did what, and stop anyone from doing something risky without sign-off" |

**This reframing directly resolves two monetization problems named in the V1 technical design, now stated in product language instead of code language:**
- Pro Max's differentiator ("higher usage limits") was never a real customer statement — nobody describes wanting "higher limits" as their reason to pay $100/month. "I can run two things at once" is. Ship the concurrency lever, and lead marketing copy with the outcome, not the mechanism.
- Enterprise's differentiator from Team was, and remains, governance and proof — not more AI capability. The two currently-dead admin roles should be marketed as "the people who can turn on governance," not generic seniority titles — which also, not coincidentally, is exactly the capability rebalancing already recommended in the technical design.

---

## Part V — The AI Engineering Organization Vision: What's Realistic, and When

Three distinct claims, evaluated separately, because conflating them is exactly the mistake the roadmap's current language makes.

### Can PawOS become an AI software engineer?
**Yes — largely already true today**, for a bounded, human-supervised task: understand a codebase, investigate an issue, write a fix, test it, ship it, with a human confirming the risky steps. This is what Build Software + Fix Production Issues already do, individually, for one person. **This is not a future vision — it is the current product, correctly described.**

### Can PawOS become an AI engineering teammate?
**Yes, realistically, within the V1→V2 horizon already designed** — this is exactly what the Orchestrator Runtime's claim-based task queue enables: a Paw that a team can hand a ticket to, that shows up in the same task-tracking surface a human teammate's work would, that shares root-cause knowledge instead of re-discovering it. It requires no new autonomy and no new trust model beyond what's already accepted — every claimed task still runs through one person's own supervised Conversation Runtime.

### Can PawOS become an AI engineering organization (i.e., an autonomous org of AI agents running an engineering department with minimal human involvement)?
**Not realistically, not as a near-term roadmap item, and not without deliberately abandoning the security posture this whole audit chain has correctly protected.** This claim requires things this document is explicitly not recommending: autonomous ticket ingestion without a human or existing-plugin trigger creating the task, agent-to-agent negotiation without a human reading every exchange, and execution that isn't gated by a person's own local, confirmed action. Every one of those would need its own dedicated security review, separate from this design track — none of them are "the next increment" of what's already been designed, they are a different product decision. **This should be named to stakeholders as long-term vision only, explicitly not on the V1 or V2 roadmap, and not promised in customer-facing language until a deliberate decision is made to pursue it.**

### Roadmap, explicitly separated

**V1 (this design track, already scoped in `PAWOS_V1_ARCHITECTURE.md`):**
- Jobs-based navigation (Part III above)
- Tier/naming fixes (Pro Max concurrency, Enterprise role capabilities, go/pro naming collision)
- Coding Runtime hardening (pre-deploy test gate, learning-from-approvals)
- Organization discoverability (onboarding step, nav promotion)
- Organization-shared knowledge (single mirror table, two call sites)
- Orchestrator Runtime MVP: claim-based task queue **within one organization**, no cross-org, no external-tracker ingestion

**V2 (named, scoped, not started):**
- External ticket-tracker ingestion (real Jira/Linear webhook sync creating tasks automatically — still human-created tickets, just not manually re-typed into PawOS)
- Ticket routing rules, load-aware assignment display, presence indicators for in-progress jobs
- Cross-runtime org-sharing extended to Documents and Research (not just Meetings)
- Support Customers as a real, shipped job
- Enterprise adoption/usage dashboard
- Pro Max concurrency's first real usage data used to tune limits

**Long-term vision (explicitly not roadmapped, requires a separate decision and security review before any design work begins):**
- Autonomous ticket triage without a human/plugin-created task as the trigger
- Any form of agent-to-agent negotiation
- Multi-organization/federated collaboration
- "AI engineering organization" as a literal, minimally-supervised claim — not to be used in customer-facing marketing until this is a deliberately funded initiative, not an assumed extension of V1/V2

---

## Part VI — Final Deliverables Summary

- **Final product architecture:** seven customer-facing jobs (Build Software, Fix Production Issues, Research, Meetings, Documents, Support Customers [V2], Manage Organization), replacing runtime-named surfaces in all customer-visible copy and navigation.
- **Final navigation architecture:** Part III's sidebar tree — jobs primary, histories secondary, Organization promoted out of Settings, internal code names unchanged.
- **Final customer journey:** Part II's per-persona table — every persona's retention and payment triggers are tied to a specific job actually completing, not a feature list.
- **Final monetization strategy:** Part IV's tier table — Go/Pro/Pro Max differ by breadth-and-concurrency for one person; Team/Enterprise differ by sharing and governance for a group. Pro Max and Enterprise both get a real, previously-missing differentiator instead of a marketing claim the code didn't back up.
- **Final runtime architecture:** unchanged from the already-accepted `PAWOS_V1_ARCHITECTURE.md` — this document changes what customers see and pay for, not how the system is built underneath it.
- **Final implementation roadmap:** V1/V2/long-term vision explicitly separated in Part V, with V1's specific implementation order unchanged from `PAWOS_V1_ARCHITECTURE.md` Part VIII (this document adds the navigation/copy work as an explicit first-class V1 line item alongside it, since it's now been shown to be as high-leverage as any backend fix).

---

*End of product architecture review. No code was written or modified. Awaiting explicit approval before any implementation begins.*
