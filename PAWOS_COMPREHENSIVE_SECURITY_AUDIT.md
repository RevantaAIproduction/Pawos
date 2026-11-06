# PawOS Comprehensive Security Audit and Threat Assessment

**Audit date:** 2026-11-07  
**Overall readiness:** **Conditional / not independently verified for release.** The local source contains meaningful controls, but this review cannot establish production configuration, deployed database policy state, credential validity, or security certification. No production exploit was attempted or demonstrated.

## Scope, evidence and limitations

Read-only review of tracked source, working-tree metadata, available ignored/untracked environment files by redacted category only, targeted Git-history search metadata, Web routes, selected SQL migrations, CLI execution policy, Electron configuration, workflows and package manifests. No production, staging, Supabase, Razorpay, GitHub or Microsoft service was accessed. Cloud settings, migration ledger, backups, runtime headers, infrastructure, live logs and active credential status were unavailable. No secrets are reproduced.

Inventory: 88 Web `route.ts` files; 99 SQL migrations in `supabase/migrations`; local refs include 405 commits. A redacted text-pattern scan covered 9,165 paths, excluding `.git`, installed dependencies and Next cache. No Gitleaks/Trufflehog/Semgrep executable was available. It was not a full entropy-aware scan. No dependency audit was run.

Selected Web auth/billing tests were attempted with `npm.cmd test`; Node exited **1** before tests because it could not `lstat C:\Users\APPLE` (`EPERM`). The ordinary `npm` launcher was denied by the runner. Therefore no current test pass is claimed. A previously reported 992-pass/1-skip Web run belongs to a separate earlier UI task and is not audit test evidence. The working tree had unrelated user modifications and untracked `.claude/settings.local.json`; they were preserved. This report is the sole intended change.

## Architecture and attack surface

| Surface | Key paths | Exposure |
|---|---|---|
| Web | `pawos-web/src/app`, `pawos-web/src/lib` | Next UI and 88 API routes; public auth/OAuth/webhooks alongside account/admin APIs |
| Database | `supabase/migrations`, `supabase/audits` | Auth, RLS, RPCs, storage, billing, entitlements; deployed state unknown |
| Desktop | `src/main`, `src/main/preload`, `src/renderer`, `src/shared` | Electron main process privileged through preload/IPC |
| CLI | `pawos-cli/src` | Device auth, workspace tools, command execution, integrations; independent trust boundary |
| Other clients | `pawos-vscode`, `packages` | Additional OAuth/shared capabilities, not dynamically tested |
| Build/release | `.github/workflows`, `dist`, `companionos` | CI/build artifacts; no submission or production deploy inspected |

## Findings

### PAWOS-SEC-01 — Ignored local environment files contain live-looking credentials

- **Severity:** High; potentially Critical if a discovered value is live and accessible to an attacker.
- **Component/evidence:** Redacted scanner found numerous non-empty server-side AI, OAuth, SMTP, payment/webhook, signing and integration credentials in ignored/untracked `.env` (lines 7–108), `.env.staging` (12–14), and `pawos-web/.env.local` (multiple entries). `.gitignore` excludes env files; `.env.example` is the tracked template. Values omitted. A Supabase anon key/public Places key may be intentionally public, unlike service keys/private secrets.
- **Scenario/impact:** Workstation malware, account compromise, accidental sharing, logs or backups could expose credentials for database, payments, email or integrations. Validity/scope is unknown.
- **Reproduction:** Inspect variable names and file metadata locally; verify status/restrictions in provider consoles. No credentials were used.
- **Remediation:** Owners should identify active keys, restrict/rotate/revoke as appropriate, inspect access logs, and use approved secret storage. Keep local templates value-free.
- **Verification:** Provider-side status and rotation evidence; no active values in scans or artifacts; development/production credentials separated.

### PAWOS-SEC-02 — Historical Google Places key pattern in Git history

- **Severity:** High if active; otherwise Medium historical exposure.
- **Evidence:** Targeted history search found commits `718fb47`, `fe6128c`, `260439f` touching `pawos-web/GOVERNANCE.md` and `pawos-web/IMPLEMENTATION_GUIDE.md`; the prior audit notes confirmed a Google Places key was committed there. Current tracked versions did not show the key. Value omitted.
- **Scenario/impact:** Removed values remain available in clones/forks/history and could be abused for quota/billing if still valid and insufficiently restricted.
- **Reproduction:** History path/commit metadata only; no provider validation or rewrite.
- **Remediation:** Confirm status and restrictions with provider; disable/rotate if live or not demonstrably restricted. History cleanup, if needed, requires repository-owner coordination.
- **Verification:** Provider confirms disabled/restricted; current docs clean; history treatment documented.

### PAWOS-SEC-03 — CLI children retain SSH/GPG agent access

- **Severity:** High.
- **Evidence:** `pawos-cli/src/local/process.ts:48-60` exempts `SSH_AUTH_SOCK` and `GPG_AGENT_INFO` from filtering; child processes inherit the remaining environment at lines 134–138 and 262. Project package scripts may be auto-approved; see SEC-04.
- **Scenario/impact:** Malicious tests/build scripts can ask an available agent to authenticate or sign as the user while it is reachable. This does not disclose private key material, but exposes its authority.
- **Reproduction:** In a disposable workspace, run a harmless script that checks presence of these variable names only. Do not request signatures or remote access.
- **Remediation:** Remove agent sockets from child environments by default; make narrowly scoped, explicit opt-in possible only with user consent.
- **Verification:** Default children lack agent variables; tests prove no agent use without explicit approval.

### PAWOS-SEC-04 — Arbitrary project package scripts can be auto-classified

- **Severity:** High.
- **Evidence:** `pawos-cli/src/local/commandPolicy.ts:109-114` returns `AUTO` for `run`/`run-script` except `env`; `npm test` is auto at 151–155 and Yarn/pnpm mirror this at 160–166. Process launch uses `shell:false`, but package managers execute project-controlled scripts.
- **Scenario/impact:** A routine-looking test/build can run arbitrary repository code, modify workspace files or make network requests. Combined with SEC-03, scripts may use ambient agent authority.
- **Reproduction:** Disposable project, benign marker-only script; inspect approval path. Audit run was not possible due runner EPERM.
- **Remediation:** Treat project scripts as arbitrary code. Require approval for first run and whenever script contents change in untrusted workspaces; persist trust only per project with clear scope.
- **Verification:** Auto mode cannot run arbitrary scripts in untrusted/changed projects; policy tests cover package scripts/lifecycle behavior.

### PAWOS-SEC-05 — Public-endpoint throttles are process-local

- **Severity:** Medium.
- **Evidence:** In-memory maps in `pawos-web/src/app/api/auth/password/forgot/route.ts:19-37`, `pawos-web/src/app/api/auth/signup/code/route.ts:19-40`, `pawos-web/src/app/api/auth/send-verification-code/route.ts`, and `pawos-web/src/lib/auth/deviceAuth.ts:20-25,76-100`; `device/exchange/route.ts:17-20` keys by first `x-forwarded-for`. Early-access route says its limit is per process.
- **Scenario/impact:** Restarts and multi-replica/serverless instances reset or split counters. Spoofable forwarding headers, if proxy trust is misconfigured, can defeat IP limits; OTP/email cost and resource abuse result. Not evidence of auth bypass.
- **Reproduction:** Dedicated staging only, multiple replicas and fixed test accounts; verify proxy sanitization.
- **Remediation:** Shared rate-limit store or trusted edge limits; trust only platform-set client IP; limit by account and network on send and verification operations.
- **Verification:** Consistent counters across replicas/restarts; supplied forwarding headers cannot evade limits; alert on send volume.

### PAWOS-SEC-06 — Supabase migration deployment and legacy entitlements unverified

- **Severity:** High verification blocker; Medium residual source-level risk.
- **Evidence:** `supabase/migrations/20261007000000_security_org_tier_and_admin_lockdown.sql` adds organization billing guards, platform-admin RLS/revokes and server-derived entitlements. It explicitly leaves existing `user_entitlements` unchanged and copies mismatches to `pawos_entitlement_review`. `20261007010000_security_seats_and_admin_identity.sql` constrains seats/admin identity but leaves legacy premium members for review. No deployed migration ledger/schema was available.
- **Scenario/impact:** If migrations are unapplied, prior direct-write tier/admin/seat weaknesses described in migration comments may persist. If applied, unreconciled legacy records may still produce incorrect entitlements depending on application path.
- **Reproduction:** Read-only local migration review only; no DB connection.
- **Remediation:** Compare deployed migration ledger, grants, policies and function definitions against source. Run read-only audit SQL, reconcile entitlement and premium-seat review records before asserting closure.
- **Verification:** Staging anon/authenticated/member/owner/service-role tests prove cross-tenant and self-upgrade denial; deployed schema matches audited source; review rows reconciled.

### PAWOS-SEC-07 — Electron sandbox is off and preload exposes a broad privileged surface

- **Severity:** Medium.
- **Evidence:** `src/main/main.ts:256-262,307-312` enables context isolation and disables Node integration, but sets `sandbox:false`. `src/main/ipc/ipcSenderGuard.ts:20-31,47-73` blocks non-file URLs in packaged mode and wraps IPC; all `file:` URLs are accepted. `src/main/preload/bridgeImpl.ts:100-674` exposes many file/project, command, credential, billing and integration methods. Permissions are allowlisted to media/notifications in `src/main/main.ts:452-455`.
- **Scenario/impact:** Renderer XSS or unsafe navigation could target a large bridge. Sender guard is useful defense-in-depth but does not replace handler input/authorization checks. Disabled sandbox increases renderer compromise impact. No exploit confirmed.
- **Reproduction:** Static review; existing sender-URL tests were not run. No malicious page was loaded into user app.
- **Remediation:** Enable sandbox where compatible; restrict exact app bundle sender path and navigation/new windows; minimize bridge methods; enforce authorization and validation within every handler; isolate remote content.
- **Verification:** Packaged malicious-navigation/subframe tests fail closed; sandbox on; handler-level checks audited and tested.

### PAWOS-SEC-08 — Pooled settlement webhook mutates state through anon Supabase client

- **Severity:** Medium, deployment-dependent.
- **Evidence:** `pawos-web/src/app/api/billing/enterprise-pooled-webhook/route.ts:19-34` verifies Razorpay signature, then initializes Supabase using public URL/anon key around lines 53–61 and updates `enterprise_pooled_settlements` / `enterprise_pooled_credits` around 105–150. Effective RLS/grants unavailable. Primary webhook uses a different path.
- **Scenario/impact:** If RLS permits public updates, direct API calls may alter financial state; if RLS denies them, valid settlements may fail/retry. Signature verification protects this endpoint but does not grant DB privileges.
- **Reproduction:** Inspect local policies; in staging use synthetic signed event and anon direct-mutation denial test.
- **Remediation:** Verify deployed policies; preferably use server-only privileged client after signature verification and enforce settlement ownership, atomicity and idempotency. Do not open public table writes to support webhook.
- **Verification:** Public roles cannot mutate; valid webhook applies once; concurrent duplicates do not double apply.

### PAWOS-SEC-09 — Secret/dependency scan coverage incomplete

- **Severity:** Medium verification gap.
- **Evidence:** Pattern scan covered 9,165 text paths; found local env files, likely synthetic test fixtures and a public Places key pattern in `.next` output. Targeted history search covered 405 commits, not a full entropy-aware scanner. No dedicated scanner or `npm audit`/OSV result was available. Web uses Next 16.2.10/Supabase JS 2.x; CLI includes `@napi-rs/keyring`, esbuild and Vitest.
- **Scenario/impact:** Secrets in binaries/maps/history or vulnerable transitive packages may escape detection. Generated chunks should be checked for accidental private values before release.
- **Reproduction:** Read-only scans; no values emitted.
- **Remediation:** Run approved full-history scanner and lockfile advisory scan in CI; inspect source maps and exact release contents; keep synthetic fixtures unmistakably fake.
- **Verification:** Reviewed all-ref scan results, advisory triage against locked versions, no server secrets in shipped artifacts.

### PAWOS-SEC-10 — Production infrastructure and release hardening cannot be verified

- **Severity:** Medium verification gap.
- **Evidence:** `.github/workflows/desktop-msix.yml` uses floating action major tags, `npm install --no-audit`, and a WACK step with `continue-on-error:true`; it may exit successfully when WACK is unavailable. No deploy workflow/IaC was identified in the inspected inventory. TLS, CORS/headers, DB network exposure, secrets manager, backups, monitoring and approvals were not accessible.
- **Scenario/impact:** Weak workflow permissions, stale dependencies, missing runtime controls or absent monitoring can undermine source-level protections or delay incident response.
- **Reproduction:** Static workflow review; no cloud account accessed.
- **Remediation:** Review Actions permissions, pin third-party actions to immutable SHAs, use lockfile-enforced installs and dependency scans, and make WACK gating explicit when certification is required. Assemble production config evidence.
- **Verification:** Protected least-privilege deployment, provenance, staging TLS/headers/CORS and monitoring evidence.

### PAWOS-SEC-11 — Auth flows appear structured but lack end-to-end security evidence

- **Severity:** Informational / verification gap.
- **Evidence:** `pawos-web/src/lib/account/accountContext.ts` verifies bearer/cookie identity with Supabase `auth.getUser()` and derives account/org/tier from database records. `pawos-web/src/lib/account/api.ts:14-32` centralizes account checks and origin rejection. `pawos-web/src/lib/auth/deviceAuth.ts:12-18,20-25,48-100` uses short-lived, one-time verifier-bound handoffs, hash-only storage and timing-safe compare. Password reset `pawos-web/src/app/api/auth/password/forgot/route.ts:13-37` uses fixed configured origin and uniform response. OAuth callbacks still require provider-specific state/PKCE/replay review.
- **Scenario/impact:** Missing state/redirect binding or refresh replay could enable account confusion; none was confirmed. SEC-05 covers throttling.
- **Reproduction:** Static review; security tests could not run; no live OAuth.
- **Remediation:** In staging test state/PKCE, allowlisted redirects, code replay, refresh rotation/revocation, enumeration, CSRF and session fixation for every provider.
- **Verification:** Invalid/replayed/expired/cross-account flows fail without account disclosure.

### PAWOS-SEC-12 — CLI path containment is strong in source, but TOCTOU needs platform tests

- **Severity:** Informational / Medium validation gap.
- **Evidence:** `pawos-cli/src/local/workspace.ts:83-131` excludes generated/credential paths; `resolveInside()` checks lexical and real paths at 233–256 and subsequent lines. It rejects absolute/UNC/drive/tilde paths, Windows alternate streams and protected paths. A path can still change between realpath validation and downstream open if a local attacker can swap links.
- **Scenario/impact:** Concurrent symlink replacement could escape workspace or protected-file boundary if later operations reopen by pathname. No exploit established.
- **Reproduction:** Platform-specific disposable symlink/TOCTOU tests; not run.
- **Remediation:** Add race tests; where in threat model, use safe handle-based opens/no-follow semantics and revalidate before writes/deletes.
- **Verification:** Outside/protected/dangling and concurrent-swap tests pass on supported OSes.

### PAWOS-SEC-13 — Agent prompt-injection boundaries only partially assessed

- **Severity:** Medium verification gap.
- **Evidence:** Relevant paths include `pawos-web/src/lib/autonomous`, `pawos-web/src/app/api/web/autonomous`, `src/main/execution`, `src/main/execution/plugins`, and `src/main/connectivity/mcp`. The audit did not trace every prompt, connector response, tool schema, approval lifecycle and execution principal end-to-end; no adversarial prompt test ran.
- **Scenario/impact:** Malicious issue/repository/web content may induce an agent to request unauthorized reads or external writes; actual risk depends on handler-time authorization and approvals. No bypass is asserted.
- **Reproduction:** Dedicated staging tenant only; no external tool execution was done.
- **Remediation:** Treat external/repository content as untrusted data; enforce auth and approval in handlers, not prompts or renderer state; minimize secret context; require approval for destructive/external writes.
- **Verification:** Cross-user/org, malicious content, approval bypass, and connector scope/revocation tests pass.

## Route-by-route authorization matrix

Classes: **Account guard** = shared `requireAccount`; **verified user** = route-level Supabase `getUser` marker, object checks still apply; **public flow** = pre-auth route requiring flow-specific proof; **signed** = webhook/signature route. This is static classification, not proof that object-level authorization passed.

| Route | Methods | Class / note |
|---|---|---|
| `/api/admin/apply-tier-override` | POST | Verified user + admin check |
| `/api/admin/cases` | GET, POST | Verified user + admin check |
| `/api/admin/early-access` | GET | Verified user + admin check |
| `/api/admin/organizations` | GET | Verified user + admin check |
| `/api/admin/organizations/[id]` | GET | Verified user + admin check |
| `/api/admin/overview` | GET | Verified user + admin check |
| `/api/admin/users` | GET | Verified user + admin check |
| `/api/admin/users/[id]` | GET | Verified user + admin check |
| `/api/auth/accept-legal` | POST | Verified user |
| `/api/auth/check-legal-acceptance` | POST | Verified user |
| `/api/auth/device/authorize` | POST | Verified user + same-site origin |
| `/api/auth/device/exchange` | POST | Public; one-time handoff/verifier/client binding; process-local limit |
| `/api/auth/device/logout` | POST | Public token revocation; verify invalidation in staging |
| `/api/auth/device/refresh` | POST | Public refresh token validated by provider; abuse control review |
| `/api/auth/google/consume` | GET | Public OAuth/deep-link consume; state/replay check required |
| `/api/auth/microsoft/consume` | GET | Public OAuth/deep-link consume; state/replay check required |
| `/api/auth/password/forgot` | POST | Public; uniform response + process-local limit |
| `/api/auth/send-verification-code` | POST | Public; process-local limit |
| `/api/auth/signup/code` | POST | Public; process-local limit |
| `/api/billing/checkout` | POST | Verified user |
| `/api/billing/checkout-credits` | POST | Verified user |
| `/api/billing/checkout-mid-month` | POST | Verified user |
| `/api/billing/checkout-seat` | POST | Verified user |
| `/api/billing/checkout-tier` | POST | Verified user |
| `/api/billing/checkout-usage-credits` | POST | Verified user |
| `/api/billing/create-billing-case` | POST | Verified user |
| `/api/billing/create-high-value-invoice` | POST | Verified user |
| `/api/billing/create-high-value-invoices` | POST | Verified user |
| `/api/billing/credit-ticket-balance` | POST | Verified user; payment binding review |
| `/api/billing/credit-usage-credits` | POST | Verified user; payment binding review |
| `/api/billing/enterprise-pooled-status` | GET, POST | Verified user |
| `/api/billing/enterprise-pooled-webhook` | POST | Signed Razorpay; anon DB mutation review (SEC-08) |
| `/api/billing/enterprise-settle-pooled` | POST | Verified user |
| `/api/billing/invoices` | POST | Verified user |
| `/api/billing/mid-month-offer` | POST | Verified user |
| `/api/billing/payment-methods` | GET | Public provider/config response; ensure no secret |
| `/api/billing/restore-subscription` | POST | Verified user |
| `/api/billing/ticket-pricing-config` | GET | Public configuration |
| `/api/billing/upload-payment-evidence` | POST | Verified user; upload/storage controls need staging test |
| `/api/billing/usage-credits-config` | GET | Public configuration |
| `/api/billing/verify-mid-month` | POST | Verified user + payment verification |
| `/api/billing/verify-seat-payment` | POST | Verified user + payment verification |
| `/api/billing/verify-subscription` | POST | Verified user + payment verification |
| `/api/billing/verify-tier-payment` | POST | Verified user + payment verification |
| `/api/billing/webhook` | POST | Signed Razorpay webhook |
| `/api/connectivity/oauth/callback/[provider]` | GET | Public OAuth callback; state/provider binding required |
| `/api/connectivity/oauth/exchange` | POST | Verified user |
| `/api/connectors/bitbucket/oauth/callback` | GET | Public OAuth callback |
| `/api/connectors/github/callback` | GET | Public OAuth callback |
| `/api/connectors/jira/callback` | GET | Public OAuth callback |
| `/api/connectors/linear/callback` | GET | Public OAuth callback |
| `/api/connectors/microsoft/callback` | GET | Public OAuth callback |
| `/api/connectors/netlify/callback` | GET | Public OAuth callback |
| `/api/connectors/railway/callback` | GET | Public OAuth callback |
| `/api/connectors/slack/callback` | GET | Public OAuth callback |
| `/api/connectors/vercel/callback` | GET | Public OAuth callback |
| `/api/dashboard/account` | DELETE | Account guard; deletion cascade not live-verified |
| `/api/dashboard/account/delete-code` | POST | Account guard; process-local/account limit |
| `/api/dashboard/companion` | GET, PUT | Account guard |
| `/api/dashboard/integrations` | GET | Account guard |
| `/api/dashboard/integrations/[connectorId]` | POST, DELETE | Account guard |
| `/api/dashboard/overview` | GET | Account guard |
| `/api/dashboard/profile` | GET, PUT | Account guard |
| `/api/early-access` | POST | Public; process-local limiter |
| `/api/organization/credit-allocations` | GET, POST | Verified user; membership role/scope test required |
| `/api/organization/credit-requests` | GET, POST | Verified user; membership role/scope test required |
| `/api/organization/logo` | GET, POST, DELETE | Verified user; org/storage scope test required |
| `/api/public-profile/[handle]` | GET | Public by design; field allowlist/enumeration review |
| `/api/waitlist/broadcast` | POST | Public, broadcast-secret guarded; limits/provisioning review |
| `/api/waitlist/join` | POST | Verified user |
| `/api/web/agent/turn` | POST | Account guard |
| `/api/web/autonomous/preview` | POST | Account guard |
| `/api/web/autonomous/runs` | POST | Account guard |
| `/api/web/autonomous/runs/[runId]` | POST | Account guard; run/org ownership required |
| `/api/web/capabilities` | GET | Account guard |
| `/api/web/changes/[requestId]` | GET | Account guard; ownership required |
| `/api/web/github/repositories` | GET | Account guard + connector scope |
| `/api/web/github/repository` | GET, PUT, DELETE | Account guard + repo ownership/scope |
| `/api/web/handoff` | GET | Account guard; token scope/expiry required |
| `/api/web/images/allowance` | GET | Account guard |
| `/api/web/images/generate` | POST | Account guard; quota/resource limits required |
| `/api/web/images/[id]` | GET | Account guard; image ownership required |
| `/api/web/tools` | GET, POST | Account guard; execution handler authorization required |
| `/api/web-chat/chats` | GET | Account guard; account scoping required |
| `/api/web-chat/messages` | POST | Account guard; account/entitlement/quota checks required |
| `/api/web-chat/uploads` | POST | Account guard; upload validation/ACL required |
| `/api/web-chat/uploads/[id]` | GET | Account guard; ownership/signed URL scope required |
| `/api/webhooks/jira` | POST | Public provider webhook; signature/replay/idempotency required |

## Table-by-table authorization matrix (representative sensitive tables)

This reflects local migration source, not every historical table/policy transition. Effective deployed policies were unavailable.

| Tables | Source evidence | Expected boundary / status |
|---|---|---|
| `platform_admins` | `20261007000000_security_org_tier_and_admin_lockdown.sql` | RLS + revoke client privileges; deployed state unknown |
| `organizations` | `20261007000000...`, `20261007010000...` | Billing tier/owner/seats/budget fields guarded; verify org policies live |
| `organization_members` | `20261007010000_security_seats_and_admin_identity.sql` | Membership/role/seat trigger; legacy premium rows need review |
| `organization_seat_purchases`, `organization_plan_purchases` | `20261007010000...` | Client privileges revoked; idempotent server purchase RPC intended |
| `user_entitlements`, `pawos_entitlement_review` | `20261007000000...` | Derived sync, but legacy values deliberately not rewritten |
| Subscription, usage bucket and wallet tables | `20261001000000_usage_buckets.sql`, `20260925090000_lock_credit_minting.sql`, `20261007030000_security_wallet_function_lockdown.sql` | Service-only mint/revoke functions; direct grants/RLS require live validation |
| `autonomous_task_runs`, `autonomous_reservation_requests`, `autonomous_external_writes` | `20260903000000_autonomous_option_b_settlement.sql`, `20260907000001_autonomous_external_writes_idempotency.sql` | Own-org/run policy intent; cross-tenant CRUD tests required |
| `web_chat_messages`, upload/attachment records | `20261004010000_web_chat.sql`, `20261004020000_web_tier_architecture.sql` | Service RPC/private file intent; Storage policies and signed URL expiry unverified |
| `meetings`, `meeting_drafts`, `meeting_scheduled_sends` | `20260908000000_meeting_persistent_storage.sql` | Owner/org RLS defined; test CRUD across two tenants |
| `enterprise_pooled_settlements`, `enterprise_pooled_credits` | Webhook route + migration history | Financial state; anon-client update design requires policy/atomicity proof (SEC-08) |
| Storage objects (avatar, evidence, chat uploads, generated images) | migrations and Web upload/download routes | Bucket privacy, ownership and signed URLs require live RLS/storage tests |

## Surface summaries

### Authentication, API and tenant isolation

`pawos-web/src/lib/account/accountContext.ts` verifies cookie/bearer identity through Supabase `auth.getUser()` and derives account/org/tier from server-side records. `pawos-web/src/lib/account/api.ts:14-32` centralizes account checks and rejects cross-origin requests when Origin is present. These are positive source controls, not proof of deployed policy. Missing-Origin non-browser calls are accepted and therefore still rely on token authentication and object authorization. IDOR, pagination/export abuse, storage access, CORS/security headers, request-size controls, SSRF and error leakage were not exhaustively tested. No confirmed IDOR is asserted.

Primary Razorpay webhook `pawos-web/src/app/api/billing/webhook/route.ts:391-439` verifies raw-body HMAC before JSON parsing. When the webhook secret is absent, it acknowledges and ignores events; this avoids unauthenticated crediting but silently disables processing unless monitored. Replay atomicity and amount/order ownership were not end-to-end proven. Stripe is not inferred as active.

### Desktop

Positive controls: context isolation, Node integration disabled, media/notifications permission allowlist, and IPC origin guard imported early. Main windows load bundled files; inspected OAuth flows use system browser. Remaining concerns are sandbox off, broad bridge, `file:` accepted without exact bundle path validation, and the need to validate each main handler’s arguments, identity and entitlement. Credential/cache encryption and updater provenance were not fully verified.

### CLI

Positive controls: workspace containment, protected credential/generated paths, lexical and realpath checks, command allowlist, separate arguments, `shell:false`, environment filtering, output caps, timeout and process-tree termination. Confirmed concerns are SEC-03/04. Keyring dependency is present, but OS-backed behavior was not tested. CLI version/publication state was not established by this audit; `/env` is diagnostic only, not PATH repair.

### AI, integrations, billing and privacy

Agent/tool paths include `pawos-web/src/lib/autonomous`, `src/main/execution`, plugins and MCP connectivity. Authorization/approval was not traced end-to-end. OAuth provider scope, state/PKCE, refresh/revocation and disconnect cleanup require staging tests. Web chat/attachments are persisted in Supabase and storage; deletion code/migrations exist, but full deletion across providers, backups, billing/legal retention and logs was not tested. AI provider contracts/configuration and production retention/training settings are unverifiable locally; do not make absolute privacy claims without that evidence.

### Infrastructure and supply chain

`.github/workflows/desktop-msix.yml` uses floating action tags, `npm install --no-audit`, and WACK with `continue-on-error:true`; it can upload an artifact when WACK is unavailable, so workflow success does not prove certification. No production deploy workflow or infrastructure-as-code was identified in the inspected inventory. TLS, CORS/headers, firewall, DB network exposure, secrets manager, backups, alerting and dependency advisory status remain unknown.

## Test evidence

| Check | Result |
|---|---|
| Static source and workflow review | Completed for cited paths; not exhaustive dynamic assessment |
| Redacted secret-pattern scan | 9,165 text paths; findings summarized above; synthetic fixtures likely present |
| Full history secret scan | Not completed with dedicated entropy-aware scanner |
| Targeted Web security tests | Attempted; not run because Node failed with `EPERM lstat C:\Users\APPLE` |
| CLI tests/typecheck/build | Not run in this audit |
| npm/OSV dependency audit | Not run |
| Staging/production RLS, IDOR, OAuth, billing replay, storage, deletion | Not run; no authorized environment accessed |
| Desktop install, IPC adversarial checks, updater signature/WACK | Not run |

## Prioritized remediation plan

1. Review ignored local credentials with owners; verify live status, restrict/rotate as appropriate, check logs; confirm historical Places key is disabled or restricted.
2. Make CLI project scripts approval-gated and remove default SSH/GPG agent inheritance.
3. Verify deployed Supabase migration ledger, RLS, grants, functions and storage policies; reconcile entitlement and premium-seat legacy review records.
4. Resolve pooled-credit webhook database privilege design and prove order ownership, amount/currency, atomicity and duplicate-event behavior.
5. Harden Electron: enable sandbox where compatible, restrict exact sender/navigation, reduce preload, audit handler-level authorization.
6. Move OTP/device/early-access throttles to shared edge/storage with trusted proxy handling and monitoring.
7. Run two-tenant IDOR/RLS/storage, auth replay/OAuth, prompt injection, command boundary, billing replay and deletion tests in dedicated staging.
8. Run full-history secrets and lockfile advisory scans; pin CI actions; enforce lockfile installs and make certification outcomes gating.
9. Verify privacy/deletion across database, object storage, integrations, email/payment providers, backups and logs.

## Five most urgent issues

1. Validate and contain credentials in ignored local environment files; check historical Google Places key status.
2. Prevent CLI auto-execution of arbitrary project scripts with ambient privileges and remove default SSH/GPG agent exposure.
3. Prove Supabase security migrations/RLS are deployed; reconcile legacy entitlement and seat records.
4. Prove pooled settlement writes and all Razorpay crediting paths are privileged, atomic and replay-safe.
5. Reduce Electron bridge risk and verify sandbox, sender/navigation restrictions and handler-level authorization.

## Overall security readiness

**Conditional / not independently verified for release.** Local source shows substantive mitigations, but the highest-impact evidence gaps are credential validity, deployed database policy state, CLI execution privilege, payment-state enforcement and Electron handler-level authorization. No production exploit was attempted or demonstrated. Do not state that PawOS is certified, completely secure, or that local migrations/tests are deployed until the criteria above have been evidenced.
