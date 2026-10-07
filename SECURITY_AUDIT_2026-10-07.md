# PawOS Security Audit

Date: 2026-10-07 · Scope: `main` at `6efc933` (PawOS Web, Supabase migrations, PawOS Desktop 1.0.2 package)
Method: static code and configuration review, local dependency audits, pattern-only secret scans. No production data was read, no production write was made, nothing was exploited, and no code was changed.

**Handling:** this file describes unfixed weaknesses. It is untracked; do not commit it to the repository.

---

## Executive Summary

The audit found **one critical and three high-severity issues**, all in how the database and the sign-up flow decide who a user is and what plan they have. The application code in most other areas is in better shape than these findings suggest: payment verification, connector credential storage, the command runner and the web OAuth flow are carefully built.

The most important findings:

| # | Severity | Finding | Confidence |
|---|---|---|---|
| C1 | Critical | Any signed-in user can create their own Team or Enterprise organization directly in the database and receive that plan for free, on Web and Desktop | High (static); live check pending |
| H1 | High | `platform_admins` has no row-level security, so any caller with the public key can likely add themselves as a platform admin and read every user's diagnostic reports | Medium-high; depends on live grants |
| H2 | High | Email ownership is verified in the client, not the server; admin rights, Build grants and organization domains are all keyed on email | Medium; depends on one Supabase setting |
| H3 | High | A real-looking Google Places API key is committed in two documentation files and in git history | High that it is present; unknown if restricted |

If the researcher's report concerns plan or entitlement bypass, privilege escalation to admin, or data exposure through Supabase's REST API, C1 and H1 are the most likely matches. Both are reachable with nothing more than the public Supabase key that ships in the desktop app and website.

What was **not** found: no SQL injection, no cross-user read of chats, connector credentials or billing records through the web API routes reviewed, no secrets inside the desktop installer, and no `.env` file ever committed.

Coverage limits are listed under "Unknowns". In particular, the database has 106 tables; the organization, admin, entitlement, credential and chat tables were read closely, the remaining organization-scoped tables were only pattern-checked.

---

## Critical Findings

### C1 — Self-service Team/Enterprise plan through direct database writes

- **Severity:** Critical
- **Affected component:** Supabase RLS on `organizations` and `organization_members`; plan resolution in Web and Desktop
- **Code locations:**
  - `supabase/migrations/20260720000000_help_center_phase1.sql:88-96` — policies `org_update_owner`, `org_insert_authenticated`
  - `supabase/migrations/20260829000000_*.sql:73-78` — policy `org_members_manage_own_org`
  - `pawos-web/src/lib/account/accountContext.ts` — `resolveAccountContext()` (tier from membership)
  - `src/main/billing/OrganizationTierVerification.ts` — `verifyRealOrganizationTier()`
  - `src/renderer/organization/OrganizationService.ts` — `createOrganization()` (client-side insert)
- **Why it is vulnerable:** the insert policy only checks `owner_user_id = auth.uid()`. Its own comment says "tier gating happens in the app". The `tier` column is free for the caller to set, and the update policy lets an owner change any column afterwards. No trigger, column grant or later migration restricts `tier`. The membership policy lets the owner of an organization insert an `active` membership row for themselves.
- **Attack scenario:** a free account calls Supabase's REST API with the public key and its own session token, inserts an `organizations` row with `tier = 'enterprise'` and itself as owner, then inserts its own `active` membership. No payment is involved.
- **Security impact:**
  - **Web:** `resolveAccountContext()` grants Team/Enterprise to anyone with an active membership in an organization of that tier. That unlocks paid web capabilities and server-funded model usage.
  - **Desktop:** `verifyRealOrganizationTier()` re-checks exactly those two rows, so the "independent verification" passes. Team-only connectors (Bitbucket), all models and organization features unlock.
  - **Billing integrity:** an owner can also update their own organization row at will (for example budget or usage columns read by `OrganizationUsageService`), since the update policy has no column limits.
- **Evidence:** the policy text above; and this was effectively done by hand on 2026-10-05 to give a test account Team (as an administrator in the SQL editor — the policies show an ordinary user can do the same through the API).
- **Recommended fix:** remove client insert/update of `tier` (and seat, budget and usage columns). Create and upgrade organizations only from the server after a verified payment (`verify-tier-payment` already does this with the service role). Either drop `org_insert_authenticated` or pin inserts to a non-paid tier, and add a trigger or column-level grant so owners cannot change billing columns. Then audit existing rows for organizations with no matching payment.

### H1 — `platform_admins` is not protected by row-level security

- **Severity:** High
- **Affected component:** Supabase table `platform_admins`; diagnostics policies; admin list merge
- **Code locations:**
  - `supabase/migrations/20260720000000_help_center_phase1.sql:10-26` — table and `is_platform_admin()`
  - same file `:178-186` — `diagnostic_issues_admin_read`, `diagnostic_reports_admin_read`
  - `supabase/migrations/20260924010000_pawos_admin_console.sql:33-39` — one-time copy of `platform_admins` into `pawos_admins`
- **Why it is vulnerable:** it is the only one of 106 tables with no `enable row level security` and no `revoke`. Supabase's default grants give the `anon` and `authenticated` roles full access to public tables, so without RLS the table is readable and writable through the REST API.
- **Attack scenario:** a signed-in user inserts their own email into `platform_admins`. `is_platform_admin(auth.jwt() ->> 'email')` then returns true for them.
- **Security impact:** read access to every user's diagnostic issues and reports (crash and bug reports, which can contain file paths, messages and environment details). It also discloses the admin email list. If any row was planted before the 2026-09-24 migration ran, that email was copied into `pawos_admins`, which gates the admin console functions.
- **Evidence:** table definition with no RLS statement; scan of all migrations for RLS enablement and revokes.
- **Recommended fix:** enable RLS on `platform_admins` with no client policies and revoke all from `anon` and `authenticated`. Then compare `platform_admins` and `pawos_admins` against the intended list.
- **Confidence:** medium-high. RLS may have been switched on by hand in the dashboard; see the verification steps.

### H2 — Email ownership is proven in the client; privileges are keyed on email

- **Severity:** High (conditional on one Supabase setting)
- **Affected component:** sign-up and verification flow; every email-based allowlist
- **Code locations:**
  - `pawos-web/src/app/api/auth/send-verification-code/route.ts` — the caller supplies both `email` and `code`
  - `src/renderer/auth/providers/EmailAuthProvider.ts:42-70` — `createAccount()` calls `supabase.auth.signUp` directly; the comment recommends turning Supabase's "Confirm email" off because "our own OTP already proved this email"
  - Email-keyed privileges: `AUTHORIZED_ADMINS` in `pawos-web/src/app/api/admin/*/route.ts`; `admin_test_tier_overrides` policies; `pawos_build_grants` (granted by email); `pawos_admins`; organization domain rules
- **Why it is vulnerable:** the six-digit code is generated and checked by the desktop app. The server endpoint just emails whatever code it is given. Nothing server-side ties a successful verification to account creation, so a caller who talks to Supabase directly skips it.
- **Attack scenario:** if "Confirm email" is disabled in the Supabase project, anyone can register any unregistered address without controlling it. Registering an address that has a pending Build grant, an unclaimed admin entry, or a company's domain inherits what that email is entitled to.
- **Security impact:** impersonation of unclaimed identities; unauthorized Build access; admin access if any allowlisted admin address is not already registered.
- **Secondary impact (unconditional):** the endpoint is an unauthenticated way to send PawOS-branded mail to any address with a caller-chosen code. Its rate limit is in memory and keyed on the `X-Forwarded-For` header.
- **Recommended fix:** keep Supabase's own email confirmation on, or move code generation and checking to the server and only create the account after a server-side match. Confirm all admin addresses are registered and protected with strong sign-in. Move admin authorization from email strings to user ids.
- **Not vulnerable:** password reset. `resetPassword()` only works for the currently signed-in session, and the web flow uses Supabase recovery links.

### H3 — Google API key committed to the repository

- **Severity:** High until confirmed restricted
- **Location:** `pawos-web/IMPLEMENTATION_GUIDE.md:167,170` and `pawos-web/GOVERNANCE.md:267,270` (`GOOGLE_PLACES_API_KEY` / `NEXT_PUBLIC_GOOGLE_PLACES_API_KEY`); the same value is in git history
- **Secret type:** Google API key (Places)
- **Active/exposed:** present in tracked files; it is not a placeholder pattern. Whether it is live or restricted was not tested.
- **Impact:** quota theft and billing abuse if unrestricted.
- **Recommended fix:** rotate it, restrict the new key by HTTP referrer and API, replace the documented value with a placeholder. Removing it from history is optional once rotated.

---

## Authorization / Tenant Isolation

**Can one user reach another user's data?** Through the web API routes reviewed: no instance found. Through the database's REST API: yes for diagnostics (H1), and plan boundaries do not hold (C1).

Reviewed and sound:

- **Chats** (`web_chats`, `web_chat_messages`): every function in `20261004050000_account_chats.sql` filters on `auth.uid()`; `p_chat_id` is checked against the caller.
- **Connector credentials:** `store_connectivity_credential` / `read_connectivity_credential` scope by `auth.uid()`; secrets live in Supabase Vault.
- **Dashboard and web-chat routes:** all go through `requireAccount()`; ids from the client are re-checked against the session's user.
- **Admin routes:** all require a bearer token and an allowlisted email (but see H2 for the weakness of email as the key).

Weaknesses:

| Severity | Finding | Location | Confidence |
|---|---|---|---|
| Medium | Any member of an organization, whatever their role, can read the organization's shared credential in plaintext; only writing requires `credentials.manage` | `20260722000000_phase6_enterprise_hardening.sql` — `read_organization_credential` | High |
| Medium | A user declares their own tier to the server; mobile pairing and mobile feature gates trust it | `20260730020000_*.sql` — `sync_my_entitlement_tier(p_tier)`, `begin_pairing_session` | High |
| Medium | The caller reports the final cost of their own autonomous run | `20260925100000_*.sql` — `settle_autonomous_task_run_pc(p_run_id, p_actual_pc)` | Low; charging may not use this value yet |
| Low | `is_org_member`, `is_org_admin`, `is_org_manager` are callable by anyone and answer "is user X in organization Y" | `20260721000300_*.sql`, `20260829000000_*.sql` | High |
| Low | Organization logo upload checks for a role named `admin`, which is not one of the defined roles | `pawos-web/src/app/api/organization/logo/route.ts:94` | High (functional bug) |

Not individually verified: the roughly 20 organization-scoped tables in `20260721000600_phase1_org_shared_data.sql` and later. They follow one pattern (`is_org_member(...) or owner`), which is sound on its own, but C1 means "member of an organization" is something a user can manufacture for an organization they create — not for someone else's.

---

## Authentication / OAuth

Sound:

- **Web connector OAuth:** state is bound to an httpOnly cookie, the session and entitlement are re-checked in the callback, and tokens go straight to the vault (`pawos-web/src/lib/account/webOAuthCallback.ts`).
- **Desktop connector OAuth:** state is a random id matched against a pending entry; client secrets stay on the server; the local listener binds to `127.0.0.1` only.
- **Sign-in:** Supabase PKCE; the verifier never leaves the client that started the flow. The new `/auth/github/start` ignores caller-supplied redirects.
- **Open redirects:** `safeNextPath` and `resolveNextPath` accept only same-origin paths.

Weaknesses:

| Severity | Finding | Location | Confidence |
|---|---|---|---|
| Medium | The token exchange endpoint is unauthenticated and forwards any `grant_type`. Anyone can use PawOS's client secrets as a proxy: redeem codes, refresh tokens they hold, or try other grants. Bitbucket rejected `client_credentials` in a live check on 2026-10-06 only because that client is marked public | `pawos-web/src/app/api/connectivity/oauth/exchange/route.ts` | High |
| Medium | Unauthenticated endpoint reports whether an email has an account and returns the internal user id. It also reads only the first page of users | `pawos-web/src/app/api/auth/check-google-account/route.ts` | High |
| Low | The sign-in callback logs the full request URL (including the one-time code), the user's email and id | `pawos-web/src/app/auth/callback/route.ts` | High |
| Low | `pawos://<provider>-auth-callback` carries no state value. PKCE prevents a foreign code from completing, so the practical effect is a failed sign-in | `src/main/auth/OAuthProtocolBridge.ts` | Medium |
| Low | Origin for redirects is taken from `X-Forwarded-Host`; safe only while the proxy overwrites that header | `resolveOrigin()` in three route files | Medium |
| Low | Rate limits are in-memory, per server instance, and keyed on a client-controllable header | `send-verification-code`, `password/forgot` | High |

---

## MCP / Connector Security

Reviewed `src/main/connectivity/mcp/` and `ConnectorMcpPlugin.ts`:

- Tool results are returned as bounded text flagged `untrusted: true`, with an explicit "data to read, not instructions" marker.
- Tool descriptions from servers are not read.
- Tokens are not logged.
- Connector use is entitlement-checked in the main process (`assertConnectorEntitled`).

Not confirmed: where MCP server addresses come from and whether a user or remote content can supply one (SSRF), and whether any write-capable tool can be invoked. `ConnectorMcpServers.ts` showed no user-supplied address handling in the lines sampled, but it was not read in full.

Webhooks:

| Severity | Finding | Location |
|---|---|---|
| Low now, High if wired up | The Jira webhook has no signature check; it compares a header to the literal `no-check` and then only logs. It must not be connected to ticket execution in this state | `pawos-web/src/app/api/webhooks/jira/route.ts` |
| Low | The enterprise pooled-billing webhook verifies with the API key secret instead of the webhook secret, using a non-constant-time comparison | `pawos-web/src/app/api/billing/enterprise-pooled-webhook/route.ts:15-17` |

---

## Electron / Desktop Security

Settings (`src/main/main.ts:254-256, 305-307`): `contextIsolation: true`, `nodeIntegration: false`, **`sandbox: false`**. No `@electron/remote` use. No `<webview>`.

| Severity | Finding | Evidence | Confidence |
|---|---|---|---|
| Medium (High if any script injection is found) | The main process trusts the window completely. There are 263 IPC handlers and no sender or origin validation; `action:execute` runs any action request it is sent | `src/main/ipc/ipc.ts`; zero matches for sender checks | High |
| Medium | The "reply allow" approval for commands and file changes is enforced in the window (`ConversationRuntime.ts`), not in the main process. Anything that gains script execution in the window bypasses it | `src/main/ipc/ipc.ts:193`; no approval state in `DesktopExecutionEngine` | Medium-high |
| Medium | No navigation or new-window guards (`will-navigate`, `setWindowOpenHandler`) and no Content-Security-Policy on the app window | no matches in `src/main` | High |
| Low-Medium | `auth:startGithubSignIn` passes a window-supplied string to `shell.openExternal` with no scheme check. `OpenUrlPlugin` does restrict to http(s) | `src/main/ipc/ipc.ts:415`, `src/main/auth/GitHubOAuthFlow.ts:43` | High |
| Low | Entitlements for desktop-only features come from a local file the user can edit (`billing/subscription.json`). Server-funded usage is separately metered, so this is self-inflicted | `src/main/billing/SubscriptionStore.ts` | High |
| Low | The app reads a `.env` from the folder beside the executable and from the current working directory, so a planted file can redirect it to another backend | `src/main/main.ts:538` | Medium |
| Info | Source maps ship inside the package (9 files) | `webpack.*.config.js` `devtool: 'source-map'` | High |

Mitigating facts: no injection route into the window was found. React escapes output; the only `dangerouslySetInnerHTML` renders a generated QR code; model-generated widgets run in a sandboxed iframe without same-origin and with their own CSP; email previews use a fully sandboxed iframe.

Local listeners are sound: all bind to `127.0.0.1`, the checkout listener requires a random token, and the OAuth relay only acts on a known random state.

Update mechanism: no update feed is configured in `electron-builder.yml`, the direct-download build is unsigned, and `electron-updater` is on a major version with a published signature-bypass advisory. The Store build updates through the Store and is not affected.

---

## AI / Agent Security

- **Command execution** (`src/main/execution/plugins/commandSafety.ts`): strong against shell injection. Commands with chaining, piping, redirection or substitution characters are rejected, and execution uses an argument array with no shell.
- **But the allowlist is by program name**, and it includes `node`, `python`, `npx`, `docker`, `ssh`, `git`, `powershell`. Each can run arbitrary code by design (`node -e`, `npx <package>`, `docker run -v`). The real boundary is therefore the user's approval, which lives in the window (see above).
- **Prompt-injection boundaries:** MCP results and web-chat attachments are explicitly marked as data. I found no equivalent marker for repository file contents, ticket text or browser page content fed to the model. Confidence: low-medium; the conversation and autonomous prompts were searched for boundary language, not read end to end.
- **Autonomous runs** (`AutonomousOrchestrator.ts`): destructive actions pause in `waiting_for_permission`, and file edits were moved back behind approval. That is the right design; it should be re-tested after any change, since ticket content is attacker-influenced input.

**Assessment:** a malicious repository or ticket can try to steer the assistant into proposing a harmful command. Today that requires the user to approve it. No path was found that executes without approval.

---

## API / Web Security

- **SQL injection:** none found; all access is through the Supabase client or parameterized functions.
- **XSS:** none found in the routes and components sampled.
- **CSRF:** state-changing routes use bearer tokens or same-site session cookies with JSON bodies; no form-based state change found.
- **File upload:** web-chat uploads sniff the file type from bytes, cap size and scope by account. The organization logo upload trusts the client's declared type and puts the client's file name into the storage path of a public bucket (`organization/logo/route.ts:111`).
- **Security headers:** `next.config.ts` sets none (no CSP, HSTS, `X-Frame-Options`, `nosniff`, `Referrer-Policy`). They may be added by the reverse proxy.
- **Billing:** payment routes verify Razorpay signatures, re-fetch the order from Razorpay, and take the tier and user from order notes rather than the request. Credit minting is restricted to the service role (`20260925090000_lock_credit_minting.sql`). The main webhook uses the raw body and a constant-time comparison. Not every billing route was read in full.

---

## Database / RLS

- 106 tables; 105 have RLS enabled. The exception is `platform_admins` (H1).
- 178 functions scanned. Privileged functions that take a user or organization id were checked for a caller check:
  - Admin console functions call `pawos_require_build_admin()`.
  - Credential, chat and subscription functions use `auth.uid()`.
  - `grant_referral_credits` had no caller check but was dropped on 2026-09-17.
- Several `security definer` functions do not pin `search_path` (for example `is_org_member`, `store_organization_credential`). Low; hardening.
- The override and audit policies select from `auth.users`, which the client role normally cannot read, so they may simply fail rather than grant access. Functional, not a hole.
- Schema drift: production lacks `organizations.seat_count` (seen 2026-10-05), so the migration files are not an exact picture of production. Every database finding needs a live check.

---

## Secrets

| Item | Result |
|---|---|
| `.env`, `.env.staging`, `pawos-web/.env.local` | Never committed; ignored by `.gitignore` |
| Tracked files, pattern scan | Google API key in two docs (H3); one private-key block in a test fixture (`ReadFilePlugin.test.ts`), expected |
| Git history, pattern scan | Same single Google key; no other key shapes |
| Desktop package (`app.asar`, bundles) | No secret-shaped strings, no env or key files |
| `publicEnvDefaults.ts` | Client ids, callback URLs and the publishable Supabase key only |
| Local `.env` | `BITBUCKET_CLIENT_SECRET` held a wrong value until 2026-10-06 |

The pattern scan covers common key formats only; it would not catch an arbitrary random string.

---

## Dependencies

Results as returned by `pnpm audit --prod` and `npm audit --omit=dev` on 2026-10-07; advisory details were not independently verified.

- **Desktop:** 23 high, 24 moderate, 6 low.
  - `electron` 37.10.3 — many high advisories fixed in later lines, including a context-isolation bypass and sandbox escapes.
  - `electron-updater` ^5 — code-signing bypass on Windows.
  - `xlsx` 0.18.5 — prototype pollution and ReDoS when parsing untrusted spreadsheets.
  - `extract-zip`, `image-size` — archive traversal and parser hangs.
- **Web:** 1 critical, 5 high, 1 moderate.
  - `next` 16.2.10 — proxy/middleware bypass. Impact here is limited because `proxy.ts` only refreshes sessions and routes do their own checks.
  - `nodemailer` — message can be sent to an unintended domain.
  - `sharp`, `postcss`, `nanoid`, `source-map-js` — transitive.

---

## Publicly Exposed Assets

| Asset | Auth | Intentional? |
|---|---|---|
| Marketing pages, `/login`, `/signup`, `/reset-password` | None | Yes |
| `/auth/callback`, `/auth/*/callback`, `/auth/github/start`, `/auth/desktop-success` | None | Yes |
| `/api/connectors/*/callback`, `/api/connectivity/oauth/callback/*` | State only | Yes |
| `/api/connectivity/oauth/exchange` | **None** | Needs tightening |
| `/api/auth/check-google-account` | **None** | Should not expose ids |
| `/api/auth/send-verification-code`, `/api/auth/password/forgot`, `/api/auth/signup/code` | None, rate-limited in memory | Partly |
| `/api/auth/google/consume`, `/api/auth/microsoft/consume` | Single-use random ref, 120 s | Yes |
| `/api/public-profile/[handle]` | None; returns only opted-in profile fields | Yes |
| `/api/billing/*-config`, `/api/billing/payment-methods` | None | Presumably |
| `/api/billing/webhook` and payment verification routes | Razorpay signature | Yes |
| `/api/webhooks/jira` | **None** | No |
| `/api/waitlist/broadcast` | Shared secret header | Yes |
| `/api/early-access`, `/api/waitlist/join` | None, rate-limited | Yes |
| `/debug/protocol` | None | Probably not for production |
| Supabase REST API with the publishable key | RLS | Yes; this is where C1 and H1 are reached |
| `org-logos` storage bucket | Public read | Appears intentional |

---

## Positive Security Controls

- Connector client secrets never reach the desktop app; exchange is server-side.
- Connector tokens are stored in Supabase Vault and scoped to the caller.
- The shell-injection fix in the command runner is architectural (no shell), not a blacklist.
- Credit minting was locked to the service role after an earlier finding.
- Payment activation trusts Razorpay-attested order data, not request bodies.
- Web OAuth has proper state, session and entitlement checks.
- Model-generated UI runs in an isolated, sandboxed frame.
- MCP output is treated and labelled as untrusted.
- Local HTTP listeners bind to loopback and require a token or state.
- No secrets in the shipped desktop package; environment files are ignored by git.
- Account deletion requires a fresh emailed code.

---

## Unknowns / Requires Runtime Verification

Each of these is a safe, read-only check to run as an administrator in the Supabase dashboard or with a throwaway test account.

1. **C1:** with a new free test account, attempt to insert an `organizations` row with `tier = 'team'` through the API. Expected if vulnerable: the row is created. Delete it afterwards.
2. **H1:** in the SQL editor run `select relrowsecurity from pg_class where relname = 'platform_admins';` and `select grantee, privilege_type from information_schema.role_table_grants where table_name = 'platform_admins';`. Then review the rows in `platform_admins` and `pawos_admins`.
3. **H2:** check Authentication → Sign In / Providers → Email → "Confirm email". Confirm each allowlisted admin address is a registered account.
4. **C1 aftermath:** list organizations with no matching payment: compare `organizations` against `payment_events` / `pawos_subscriptions`.
5. **H3:** check the key's restrictions and usage in Google Cloud Console.
6. **Security headers:** `curl -I https://pawos.revantaai.com` and confirm what the proxy adds.
7. **Proxy header handling:** confirm the reverse proxy overwrites `X-Forwarded-Host` and `X-Forwarded-For`.
8. **AI key delivery:** how the Store build obtains its model key is unresolved. The code reads `GEMINI_API_KEY` from a local `.env` and hands it to the window, and no key ships in the package. If a shared key reaches clients at runtime, it is extractable.
9. **Storage bucket policies** for `org-logos`, `ticket-evidence` and the web-chat uploads bucket (not defined in the migrations read).
10. **Supabase redirect allowlist:** confirm it contains only PawOS URLs and no wildcards.
11. **Repository visibility:** if the GitHub repository is or was public, treat H3 as exposed.
12. **Remaining organization-scoped tables and billing routes** not read in full.

---

## Priority Remediation Plan

**1. Immediate**

- C1: stop clients setting `tier` on `organizations`; audit existing organizations.
- H1: enable RLS and revoke client access on `platform_admins`; review both admin lists.
- H3: rotate and restrict the Google key.
- H2: confirm "Confirm email" is on; confirm admin addresses are registered.

**2. High priority**

- Restrict `/api/connectivity/oauth/exchange` to `authorization_code` and `refresh_token`, and require a signed-in caller.
- Remove the user id from `/api/auth/check-google-account`, or replace the endpoint.
- Replace `sync_my_entitlement_tier` with a server-derived tier.
- Move admin authorization from email strings to user ids in one shared server check.
- Move code generation and verification for sign-up to the server.

**3. Medium priority**

- Enforce action approval in the main process, and validate IPC senders.
- Add navigation and window-open guards, a CSP, and a scheme check on `auth:startGithubSignIn`.
- Upgrade `electron`, `electron-updater`, `next`, `nodemailer`, `xlsx`.
- Restrict `read_organization_credential` to roles that need it.
- Add real signature verification to the Jira webhook before it does anything; fix the pooled-billing webhook secret.

**4. Hardening**

- Security headers on the website.
- Durable, proxy-aware rate limiting.
- Stop logging one-time codes and emails in `/auth/callback`.
- Sniff file type and sanitize the name for organization logos.
- Pin `search_path` on privileged functions; revoke public execute on membership helper functions.
- Drop source maps from the package; remove `/debug/protocol` from production.
- Add untrusted-content markers for repository, ticket and browser content in prompts.

---

## Security Researcher Readiness

The five areas an outside researcher is most likely to test first, in order:

1. **Supabase REST API with the public key.** The key and project URL are in the desktop app and website. Researchers enumerate tables and functions directly. C1, H1 and `sync_my_entitlement_tier` are all found this way.
2. **Plan and entitlement bypass.** Free-to-paid escalation is the classic finding for a tiered product, and C1 is a short path to it.
3. **Unauthenticated API routes.** `/api/connectivity/oauth/exchange`, `/api/auth/check-google-account` and `/api/auth/send-verification-code` stand out in any route listing.
4. **Sign-up and identity.** Email verification bypass and anything keyed on email, including the hardcoded admin list.
5. **The desktop app.** Unpacking the package (source maps included), reading the IPC surface, and testing `pawos://` links and local ports for a route from web content to command execution.
