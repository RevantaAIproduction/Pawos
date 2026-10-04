# PawOS Web — tier, capability and connectivity architecture

Developer reference for PawOS Web (`pawos-web`, the signed-in `/app` workspace and `/dashboard`).
Items marked **FUTURE** are designed but **not implemented**.

```
PawOS Account
  ├── Plan / entitlements      (one: subscription or organization tier)
  ├── AI usage allowance       (one: usage buckets, reserve_usage → settle_usage)
  ├── Web capabilities         (pawos-web/src/lib/webPolicy/webCapabilities.ts)
  └── Desktop capabilities     (src/main/billing/EntitlementService.ts — unchanged)
```

## 1. The existing PawOS usage system

Usage is metered in Paw Compute (PC) against **usage buckets** (`supabase/migrations/20261001000000_usage_buckets.sql`).
Every model call is:

1. `reserve_usage(p_request_key, p_model, p_input_tokens, p_input_is_upper_bound, p_max_output_tokens, p_category, p_scope)` —
   the server prices the call, holds the amount on the account's bucket, and refuses
   (`plan_exhausted`, `plan_weekly_paced`, `no_allowance`) **before** the model is called;
2. the model call;
3. `settle_usage(reservation, usage_event_id, tokens…)` with the provider-reported tokens, or
   `release_usage_reservation(reservation)` when the call produced no billable usage.
   A reservation that is never closed is settled by the server at its full amount after its expiry.

`get_my_usage_summary()` and `get_my_usage_history()` are the read side. All of these run as the
signed-in user (`auth.uid()`); the client can never choose the user, the bucket or the price.

## 2. Web usage

`pawos-web/src/lib/webChat/webChat.ts`:

| Tier | What limits Web chat | Where it's enforced |
|---|---|---|
| Paw Go | `WEB_POLICY.goLifetimeWebMessages` = **4 lifetime Web messages** (chat and code changes together), across all chats; prompts of **at most 2 lines** (`goMaxPromptLines`, `goMaxPromptChars`) | Database: `web_chat_begin_request` / `web_chat_append_exchange`; prompt length: `promptTooLongFor()` on the server, shown live in the composer |
| Pro, Pro Max | The plan's existing AI usage allowance | `reserve_usage` / `settle_usage`, categories `web-chat`, `web-code-change` |
| Team, Enterprise | The organization's shared monthly pool — one unit per Web message (a code change is one message), exactly as Desktop counts one per turn | `increment_organization_usage(org, 'aiReasoning', 1)` as the signed-in member, after the request is claimed (`lib/webChat/sharedUsage.ts`) |

Go messages are not charged to a bucket (Go Desktop usage policy is untouched). A failed reply never
consumes a Go message and never charges a paid plan.

## 3. Desktop usage

Unchanged. The desktop app's `UsageBucketClient` calls the same three functions with categories such
as `chat` and `meetings`. Desktop pricing, compute limits and capabilities are not modified.

## 4. Web capability policy

`webCapabilities.ts` is the single server-side policy. Input: the server-resolved tier only
(`accountContext.ts`). Every Web API route calls `requireWebCapability()`; React only displays what
`GET /api/web/capabilities` / `resolveWebCapabilities()` returned.

| Capability | Status today |
|---|---|
| `web.chat` | available — all tiers |
| `web.codeReview` | available — all tiers (pasted code) |
| `web.fileUpload` | available — paid plans (text/code files, photos); not Paw Go |
| `web.continueInDesktop` | available — all tiers |
| `web.codeChanges` | available — every plan; Paw Go: small frontend changes, paid plans: frontend and backend; needs GitHub connected + a repository selected — see §13 |
| `web.integrationContext` | desktopOnly |
| `web.mcpRead` | desktopOnly |
| `web.remoteWork`, `web.autonomousWork`, `web.browserWork` | **FUTURE** — no route exists |

Each request to a Web API is checked for, in order: an authenticated session → the account's
server-resolved plan → the capability → the usage allowance (or Go cap) → ownership of every
resource it names (chat, photo). Nothing in the request body (tier, limit, user id, capability map)
is read.

## 5. Desktop capability policy

`DESKTOP_ONLY_CAPABILITIES` (in `webCapabilities.ts`) lists what only PawOS Desktop does: local
filesystem, terminal, browser automation, coding runtime, tests, dev environment, Git
Git in a local checkout (other branches, history, merges, local-only repositories), Autonomous Work,
connected services beyond Web's code changes on GitHub, desktop Companion runtime, offline, OS features.
The Web chat's system prompt is built from this list; when a request needs one, the model says so
and ends its reply with `[[requires-desktop]]`, which the server strips and stores as
`requires_desktop` so the UI offers **Continue in PawOS Desktop**. Web never claims to have run,
changed or tested anything.

## 6. Shared account entitlement

One tier per account, resolved on the server from existing records (organization
membership → subscription → Go). The Web policy and the connector entitlement mirror
(`entitlements.ts`) both read that tier; there is no Web plan or Web subscription.
The tier is resolved exactly as PawOS Desktop resolves it (`accountContext.ts` mirrors
`EntitlementService.baseTier()` / `effectiveTier()`), so a plan bought on Web or on Desktop is the
same plan, with the same usage, on both. Web differs only in what it can do (§4, §15) and in Paw Go's
4-message Web cap.

## 7. Shared usage allowance

Web usage is counted **where Desktop counts that plan's usage** (`webUsageSourceFor()` in
`webCapabilities.ts`), through the **same functions**, as the **same user**:

* Pro / Pro Max — the account's usage buckets (`reserve_usage` → `settle_usage`).
* Team / Enterprise — the organization's shared pool (`increment_organization_usage`); never the
  member's own buckets or credits.
* Paw Go — its Web message cap only.

Desktop activity can exhaust the allowance for Web and vice versa. Web activity is told
apart only by the reservation category (`web-chat`), which the dashboard uses to show
"Web / Desktop" activity — display only, never authorization.

Execution surface (`"web" | "desktop"`) is also stored on `web_chats`, `web_chat_messages` and
`web_chat_requests`, and shown in the dashboard's Recent activity. It is never an authorization input.

## 8. Web / mobile connectivity model

The server is the source of truth; the browser is a view that can disappear at any moment.

```
client: send(requestId)  ──►  server: web_chat_begin_request   (claim; Go: takes a message slot)
                               server: reserve_usage            (paid)
                               server: model call
                               server: web_chat_append_exchange (atomic: messages + counter + ledger + photo)
                               server: settle_usage
client ◄── reply (if still connected)
```

* **One plain HTTP request per send**, carrying a client-generated `requestId`. No WebSocket, no
  streaming; nothing depends on the connection staying open. (Streaming, if added later, is a
  presentation layer only — the stored reply stays authoritative.)
* **Request ledger** (`web_chat_requests`): a retry with the same id while the first attempt runs
  gets **202 `processing`** — no second model call. After it finishes, a retry gets the stored reply
  (`recovered: true`) — no duplicate message, no second charge, no second Go message. A failed
  attempt releases its claim. A claim abandoned by a crashed server expires after
  `WEB_POLICY.requestLeaseSeconds` and may be taken over.
* **Client** (`WorkspaceChat.tsx`, `pendingSend.ts`): the unanswered send is noted in
  `sessionStorage` (text and ids only — never tokens). Each answer is classified by
  `classifySendResponse()` into delivered / processing / notReceived / rejected / uncertain.
  "Uncertain" (no answer, proxy error) retries with the same id; "processing" polls with
  `recoverOnly`; a reload or a restored tab asks the server with `recoverOnly` and shows the message
  as pending until it answers. On return from the background (>30 s) or from the back/forward
  cache, the open chat is re-read from the server.
* **Connection state**: Online / Reconnecting / Offline, shown only when not online.
  `navigator.onLine === false` is trusted; `true` is not — reachability is decided by real requests.
* **Photos** go to the server immediately (`POST /api/web-chat/uploads`, idempotent by `uploadId`,
  cancellable, retryable), are type-checked from their bytes and stored in the private
  `web-chat-uploads` bucket; the browser reads them back through `GET /api/web-chat/uploads/<id>`.
* The service worker (`public/sw.js`) never answers `/api/*` from a cache.

## 9. OAuth: Web vs Desktop

Both converge on the **same** credential store (`connectivity_credentials`, Vault-backed, written
by `store_connectivity_credential`) and the **same** connection rows (`connectivity_connections`).

* **Desktop**: the desktop app's OAuth flows (loopback / `pawos://` protocol relay). Unchanged.
* **Web** (`webOAuth.ts`): the hosted HTTPS callback, a `web.`-prefixed state bound to an httpOnly
  cookie, the code exchanged on the server. Tokens never reach the browser — not in a URL, cookie or
  response body. No localhost/loopback callback. After the provider redirects back (often a new tab
  or the back button on a phone), the Integrations page is server-rendered from the stored rows and
  refreshes again on `pageshow` (bfcache) and on returning to the tab.

## 10. MCP security boundary

PawOS Web makes **no** MCP calls today (`web.mcpRead` is desktopOnly); the Integrations page says
MCP runs in the desktop app. `webMcpPolicy.ts` is the single gate a future server-side MCP client
must pass: capability → read-only (writes are never allowed from the web) → provider allowlist →
connector entitlement → tool allowlist (`WEB_MCP_READ_ALLOWLIST`, empty). MCP endpoints are never
exposed to the browser, and credentials stay server-side. Desktop MCP is unchanged.

## 11. FUTURE: Web Autonomous Work

**Not implemented.** `webPolicy/remoteWork.ts` defines the contract only
(`RemoteWorkProvider`, `RemoteWorkSession`; `remoteWorkProvider = null`):

```
Web → create remote work session (idempotent requestId) → isolated remote workspace
    → PawOS coding runtime (terminal, browser, MCP, tests) → changes → commit / PR
    → review in Web → Continue in Desktop
```

Rules for the implementation: gated by `web.remoteWork` / `web.autonomousWork`; charged through the
existing buckets and Autonomous Task Credits (no Web balance); scoped, short-lived credentials in the
workspace; `surface = "web"` on every record. Until then the UI shows Autonomous Work as a Desktop
feature and no route can start it.

## 12. Web → Desktop handoff

Chats are one history across the account (§14), so a Web or mobile chat is already in PawOS Desktop's
chat list — open it there and keep going in the same chat, with Desktop's full capabilities.

"Continue in PawOS Desktop" (`GET /api/web/handoff?chat=<id>`, session + `web.continueInDesktop` +
ownership) additionally gives a copy of the conversation and, on a computer, `pawos://jump/new-chat`
to bring the desktop app forward. The link carries no token, account id or content.

## 13. Code changes from Web and mobile ("Change code" mode)

From PawOS Web — including a phone — a user describes a change and PawOS makes it in their GitHub
repository and **pushes it to the default branch**, then shows the repository's preview.

| | Paw Go | Paid plans (Pro, Pro Max, Team, Enterprise) |
|---|---|---|
| Mode name | "Small change" | "Change code" |
| What it may touch | Small frontend changes — text, headings, titles, labels, buttons, styles (`isFrontendPath`), ≤ 2 files, ≤ 40 changed lines; **existing files only** (`new_file`) and **no assets** — no images, icons, SVGs, fonts, media or `data:` URLs added (`adds_asset`); `.svg` files are not editable | Frontend **and** backend source (`isFullScopePath`), ≤ 10 files |
| Prompt | ≤ 2 lines | No line limit |
| Counts as | One of its 4 lifetime Web messages (a refused or no-op change does not count) | Pro / Pro Max: model calls on the plan's usage allowance (`web-code-change`). Team / Enterprise: one unit of the organization pool |
| Automatic fixes | 1 | 2 |
| Photos / file attachments | No | Yes |

**Never editable, on any plan**: `.env*` (except `.env.example`), keys and certificates, `.github/`
(CI workflows), lockfiles, `.git`, `node_modules`, build output, binary files, paths outside the
repository.

**Required, checked on the server before anything is claimed or charged:** the plan's
`web.codeChanges` capability → GitHub connected (`connectivity_connections` + a stored credential) →
a repository selected (`web_repository_selection`, saved only after GitHub confirms the account can
**push** to it) → for paid plans, the usage allowance per model call (`reserve_usage`, else 402).

**What runs** (`lib/webCode/codeChange.ts`), each step recorded live in `web_code_changes` and shown
in the **task panel** (on the right on a computer, a folding card on a phone):

1. **Read the repository** — the default branch's file list, filtered by the plan's path rule.
2. **Choose the files** — model call 1.
3. **Write the change** — model call 2: complete new file contents; checked against the path rule and
   the size limits.
4. **Check for problems** — leftover merge markers, invalid JSON, a file the model cut off. If anything
   looks broken, one repair model call; still broken → nothing is pushed.
5. **Commit and push to the default branch** — a fast-forward, never a force push. If the branch moved
   meanwhile, the change is rebuilt on the new head only when nobody touched the same files; otherwise
   nothing is pushed. If GitHub refuses (branch protection), the change goes to `pawos-web/<request id>`
   with a pull request, and the user is told exactly that.
6. **Preview and checks** (`lib/webCode/changeWatch.ts`) — PawOS Web does not build or run code; it
   reads what GitHub reports for the commit: deployment statuses (Vercel, Netlify and other hosts post
   these), commit statuses and check runs. The preview URL is opened in a **new tab**, which the chat
   opens from the user's tap on Send (`/app/preview/<request id>`), so phone browsers allow it. If a
   check or deployment **fails**, the failure reports and annotations go to a fix model call and the
   fix is pushed — up to the plan's limit, each attempt claimed atomically
   (`web_code_change_claim_fix`) so two open tabs never fix twice. A repository with no deployments or
   checks is reported as such after `previewWaitSeconds`.

The user is told when it's done: the chat reply, the task panel, and a browser notification if the
tab is in the background and notifications are allowed.

**Credentials**: the GitHub token is the account's existing connector credential, read on the server
with `read_connectivity_credential()` under the user's own session; never returned, logged or put in a
URL. GitHub can be connected **from Web/mobile** (same connector OAuth app, scopes `repo read:org`,
hosted callback `/api/connectors/github/callback`, same credential store as the desktop app).

**Mobile safety**: a change is one request under the same request ledger as chat (lease 300 s); the
task panel and preview tab poll the server, so a phone can lock, switch networks or reload and pick up
where the change is. A retried request never pushes twice.

**Routes**: `POST /api/web-chat/messages` (`mode: "codeChange"`), `GET /api/web/changes/<request id>`,
`GET /api/web/github/repositories`, `GET|PUT|DELETE /api/web/github/repository`.

## 14. One chat history across Desktop, Web and mobile

Every chat lives in the account's chat store (`web_chats` / `web_chat_messages`), whichever app it
was written in, and every chat and message carries the surface it ran on (`'web' | 'desktop'`).

* **PawOS Desktop** (`src/main/conversation/AccountChatSync.ts`) syncs each finished turn with
  `account_chat_sync_desktop_turn()` as the signed-in user, through an outbox that survives restarts
  and offline periods (a repeated turn is ignored). Only the conversation text is sent — tool output,
  local file contents, screenshots and evidence stay on the computer. A chat is synced only to the
  account it was started under; chats from before sign-in, or another account's, are never uploaded.
  The Desktop chat list also shows the account's chats from Web, mobile and other computers
  (`get_my_account_chats` / `get_my_account_chat`, labelled "Web" / "Other device"); continuing one
  brings it onto the computer as the same chat. Renames and deletes reach the account too.
* **PawOS Web and mobile** list Desktop chats with a "Desktop" badge, label each message that ran on
  Desktop, and say plainly what each surface can do: Web and mobile chat and change code in GitHub;
  working on the user's computer (files, terminal, tests, local projects) needs PawOS Desktop, which
  has the full set. A Desktop chat can be continued on Web; it stays one chat.
* **Usage stays one pool.** Desktop turns are metered by the desktop app as before; the server never
  counts them toward a Web message cap (`pawos_web_chat_messages_used` counts `surface = 'web'`).
  Web activity is charged to the same allowance (§7).

Migration: `20261004050000_account_chats.sql` (`desktop_session_id`, the account-chat RPCs, Web-only
cap counting). Every RPC is scoped to `auth.uid()`; another account's chat can't be read, written,
renamed or deleted.

## 15. Limits and capabilities by surface

One account, one plan, one chat history. What differs between surfaces is **what each one can do**;
what differs between plans is **how much** — and only Paw Go has a separate Web limit.

### Limits

| Plan | PawOS Desktop | PawOS Web and mobile browser | Same pool? |
|---|---|---|---|
| Paw Go | 500 PC every 14 days; Think-only (planning and analysis, no execution) | **4 Web messages, lifetime** — chat and code changes together, across all chats; prompts of at most 2 lines | **No** — separate. Web messages never use Go's Desktop allowance, and Desktop turns never count toward the 4 |
| Pro | 2,000 PC per billing period, weekly limit 1,000 PC | Same allowance | **Yes** — one pool |
| Pro Max 5x | 10,000 PC per billing period, weekly limit 5,000 PC | Same allowance | **Yes** |
| Pro Max 20x | 25,000 PC per billing period, weekly limit 12,500 PC | Same allowance | **Yes** |
| Team / Enterprise | The organization's shared monthly pool, one unit per turn | Same pool, one unit per Web message (a code change is one) | **Yes** — one pool |

* Pro / Pro Max: every Web model call is reserved and settled on the **same** usage buckets as
  Desktop (`reserve_usage` → `settle_usage`, categories `web-chat` / `web-code-change`). Team /
  Enterprise: each Web message takes one unit of the organization's pool, as a Desktop turn does.
  Using PawOS on a phone uses the same allowance as using it on the computer; there is no Web balance.
* A Web **code change** is at least two model calls (choose files, write the change), plus one repair
  call if the edit looked broken, plus up to the plan's automatic fixes. On Go the whole change is one
  of its 4 messages; on Pro / Pro Max each call is metered; on Team / Enterprise the change is one
  unit of the pool.
* A failed reply, a refused change or a change that edits nothing never uses a Go message and never
  charges a paid plan.
* Purchased credits (Pro / Pro Max) are used after the plan's included PC on every surface alike.
* Per-request limits on Web (all plans): message ≤ 4,000 characters; text/code attachment ≤ 60 KB;
  photo ≤ 5 MB, 50 photo uploads a day.

### Capabilities

| Capability | Desktop | Web / mobile — Paw Go | Web / mobile — paid plans |
|---|---|---|---|
| Chat, explain, plan, review pasted code | ✓ | ✓ (within 4 messages, ≤ 2-line prompts) | ✓ |
| Attach photos (camera / library) and text/code files | ✓ | — (no attach button; the server refuses it too) | ✓ |
| Change code in a connected GitHub repository, pushed to the default branch | ✓ (paid plans, local checkout) | Small frontend changes in existing files: ≤ 2 files, ≤ 40 changed lines; no new files, no assets | Frontend and backend: ≤ 10 files |
| Live preview from the repository's preview deployments (new tab) | — (runs locally instead) | ✓ | ✓ |
| Automatic fix when a check or deployment fails | — (runs tests locally instead) | 1 attempt | 2 attempts |
| Task panel (plan / steps of a change) | ✓ | ✓ | ✓ |
| Connect GitHub from the browser or phone | ✓ | ✓ | ✓ |
| Same chats on every device, with surface labels | ✓ | ✓ | ✓ |
| Continue in PawOS Desktop | — | ✓ | ✓ |
| Local files, terminal, run tests, install packages, local Git | ✓ (paid plans) | — | — |
| Autonomous Work, browser automation | ✓ (as the plan allows) | — (**FUTURE**) | — (**FUTURE**) |
| Jira, Linear, Slack and other connector actions; MCP tools | ✓ (as the plan allows) | — | — |
| Meetings, Companion, offline use, OS features | ✓ | — | — |

**Never editable from Web, on any plan:** `.env*` (except `.env.example`), keys and certificates,
`.github/` workflows, lockfiles, `.git`, `node_modules`, build output, binaries (§13).

Everything above is decided on the server from the account's resolved plan
(`webCapabilities.ts`, `codePolicy.ts`, the usage functions); the browser only displays it.

## 16. Why Web has no separate wallet

A second balance would split one customer's allowance into two that can disagree, double-charge,
or be played against each other (use up one, fall back to the other). It would also need its own
pricing, refunds, reconciliation and support. Instead Web is a **surface** on the account: it has
capabilities (what it may do) but draws on the account's one plan and one usage allowance, through
the server functions the desktop app already uses. The only Web-specific number is Paw Go's
lifetime message cap, which is a capability limit, not a balance.

---

### Database objects (migration `20261004020000_web_tier_architecture.sql`)

| Object | Purpose |
|---|---|
| `web_chat_usage` | Monotonic per-account Web message counter (Go limit survives chat deletion) |
| `web_chat_requests` | Request ledger: claims, `processing` / `completed` / `failed`, lease |
| `web_chat_attachments` + bucket `web-chat-uploads` | Photos; private; service-role access only |
| `web_chats.surface`, `web_chat_messages.surface`, `.requires_desktop` | Activity surface; Desktop hand-off hint |
| `web_chat_begin_request`, `web_chat_fail_request`, `web_chat_append_exchange` (8 args) | Service-role-only functions |
| Writer-guard triggers | Direct inserts/updates refused even for the service role; messages immutable |
| `web_repository_selection` (migration `20261004030000_web_repository_selection.sql`) | The repository Web makes code changes in; owner-read, server-written |
| `web_code_changes`, `web_code_change_claim_fix`, message caps over a window (migration `20261004040000_web_code_changes.sql`) | Each change's steps, commit, preview and fixes; atomic fix claims; the ledger can no longer be deleted while the account exists |
| `web_chats.desktop_session_id`, `account_chat_*` / `get_my_account_chat(s)` RPCs (migration `20261004050000_account_chats.sql`) | One chat history across Desktop, Web and mobile; Web caps count Web messages only |
| `web_build_usage` (migration `20261004060000_web_build_usage.sql`) | Paw Compute used by Web messages on a plan whose included allowance PawOS Desktop enforces on the device, so Web stays within that allowance; service-role only |

Verified locally on PostgreSQL 16 by `supabase/tests/web_tier/run_local.sh` (incl. 12-way and 10-way
concurrency races). Browser behaviour is verified by `pawos-web/e2e/` (`npm run test:e2e`).
