# Security release — production checklist

Everything here is done by a person with production access. None of it has been done yet, and
nothing in this release has been run against production: all testing was on a throwaway local
database and a local build.

Work top to bottom. Do not deploy the website before the migrations are applied.
Scripts are in this folder; migrations are in `supabase/migrations/`.

Two kinds of item:

- **BLOCKING** — the release does not go live until it is resolved.
- **REVIEW** — a person looks and decides. Nothing is downgraded, changed or deleted automatically.

## A. Before touching anything

1. Take a database backup, or confirm point-in-time recovery is on.
2. Run `20261007_production_preflight.sql` in the SQL editor. **Read section 4 first** (the last
   result): it lists every item as BLOCKING, REVIEW or OK.

### BLOCKING — resolve before going live

| Item in section 4 | What it means | What to do |
|---|---|---|
| columns the migrations require | A table or column a migration refers to is missing here | Stop. Send the row back; the migration must be corrected first |
| an administrator account that can be bound | Migration 2 needs at least one allow-listed admin with a confirmed account (query 2a: `will_bind = true`) | Have each administrator sign in once, then re-run |
| wallet credit without payment | A signed-in user can credit a wallet without paying | Apply migration 4. It can be applied first, on its own |
| server-only crediting functions | A `*_service` crediting function is callable by clients | Stop. Send the row back |
| older wallet functions that take a signed amount | Earlier versions of the reservation functions are callable and the wallet still has a writable `balance_pc` | Stop. Send the row back |
| tables without row level security | A table clients can reach has no row level security | Stop. Send the row back |
| administrator list open to clients | `platform_admins` / `pawos_admins` readable or writable by clients | Apply migration 1 |
| policies that apply to every caller alike | A policy does not depend on who is asking | Stop. Send the row back |
| tier, seats and entitlements writable by clients | The organization and membership guards are not installed | Apply migrations 1 and 2 |
| recorded usage can be lowered | Negative usage amounts are accepted | Apply migration 5 |
| any row in **section 3** marked BLOCKING | A production-only table has no row level security, is reachable without signing in, or has a policy open to every signed-in user | Fix the policy in the dashboard, re-run the pre-flight |

Also BLOCKING, and not visible to SQL:

- `JIRA_WEBHOOK_SECRET` is set in the website's environment to the secret on the Jira webhook.
  Without it the endpoint refuses every delivery.
- `RAZORPAY_WEBHOOK_SECRET` is set and matches the Razorpay dashboard. Both billing webhooks use it.
- Supabase → Authentication → Email → **Confirm email is on**.
- Supabase → Authentication → URL Configuration: the redirect allowlist holds only PawOS URLs
  (no wildcards, no other domains, no localhost).

### REVIEW — a person decides; nothing is changed for you

| Item | Where | Decide |
|---|---|---|
| Team / Enterprise organizations | pre-flight 2b; audit query 1 | Which are legitimate, and how many seats (and Premium seats) each really bought. Delete the test organization "PawOS Test Team" |
| Stored tiers the server cannot account for | pre-flight 2c | Migration 1 copies them to `pawos_entitlement_review` and changes none. Reconcile each afterwards |
| Existing Premium members | verification query C, after migration 2 | Existing members are untouched. Set `paid_premium_seats` to what was bought |
| Wallet top-ups with no payment behind them | pre-flight 2e | Whether each is legitimate. Nothing is removed |
| Administrators | pre-flight 2a | Every address is one you put there. `will_bind = false` means no admin access after migration 2 until re-added |
| Production-only tables marked REVIEW | pre-flight section 3 and the policy list under it | Each policy limits rows to the caller's own account or organization |
| Storage buckets | pre-flight, last two results | `org-logos`: who may insert, update, delete. `ticket-evidence` and `web-chat-uploads` are private |

## B. Apply the migrations, in this order

Apply one, check it finished without error, then the next. They are safe to re-run. They remove
no row and downgrade no organization or account.

1. `20261007000000_security_org_tier_and_admin_lockdown.sql`
2. `20261007010000_security_seats_and_admin_identity.sql` — read the notice it prints; it names any
   administrator left unbound. It stops, changing nothing, if none can be bound.
3. `20261007020000_security_function_hardening.sql`
4. `20261007030000_security_wallet_function_lockdown.sql` — independent of the others; apply it
   first if section 4 shows "wallet credit without payment" as BLOCKING.
5. `20261007040000_security_usage_cannot_decrease.sql`

## C. Straight after the migrations

1. Run `20261007_post_migration_verification.sql`. Every row of its first result must show
   `pass = true`. **A row with `pass = false` is BLOCKING**: send it back.
2. Read its sweep queries S1–S3 (tables with no row level security, policies open to everyone,
   privileged functions that never check the caller). S3's comment lists the expected names;
   anything else is BLOCKING until looked at.
3. Re-run the pre-flight and confirm section 4 shows nothing BLOCKING.
4. REVIEW follow-ups, in your own time:
   - Record what each legitimate organization paid for:
     ```sql
     update public.organizations set seat_count = <paid seats>, paid_premium_seats = <paid Premium seats> where id = '<organization id>';
     ```
   - Reconcile `pawos_entitlement_review` (the two statements are in migration 1, section 3).
   - Re-add any administrator left unbound, from the admin console.

## D. Other configuration

| Setting | Where | What to do |
|---|---|---|
| Razorpay webhook events | Razorpay dashboard | `payment.captured` is delivered to `/api/billing/webhook` (it now also completes seat purchases) |
| `CONNECTIVITY_EXCHANGE_REQUIRE_SESSION` | website hosting environment | Leave unset. Set to `true` only after desktop 1.0.2 is retired |
| Google Places key | Google Cloud Console | Rotate and restrict it. Deferred by decision; the old key stays in git history (commit `a9da9b1`) |

## E. Deploy the website, then test with a fresh free account

Each of these must be refused:

1. Create a Team or Enterprise organization with a direct API request.
2. Change an organization's tier, seat count or Premium seat count.
3. Read or insert into `platform_admins`.
4. Call `sync_my_entitlement_tier('enterprise')` and read back the stored tier (must be `go`).
5. Call `add_ticket_balance(null, 500, 'x')` (permission denied).
6. Open `/api/admin/early-access` with that account's token (403).
7. POST `client_credentials` to `/api/connectivity/oauth/exchange` (400).
8. POST an unsigned event to `/api/webhooks/jira` (401).

Then confirm the legitimate paths still work: sign in, create a free organization, connect one
service from the desktop app, open the admin pages as an administrator.

## Not part of this release

Desktop changes (server-verified sign-up, seat purchases through the server, the session header on
the token exchange, the IPC origin check, the untrusted-content rule) take effect only in the next
desktop build. Until then, "Add member seat" in desktop 1.0.2 does not add a seat.
