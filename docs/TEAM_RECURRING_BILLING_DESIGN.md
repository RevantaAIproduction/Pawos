# Paw Team recurring billing — design for review

Status: **proposal, not implemented.** Team and Enterprise checkout stay gated and additional-seat
purchases stay paused (`ADDITIONAL_SEAT_PURCHASES_PAUSED`) until this is built, tested and approved.

## The problem being fixed

Today a Team plan (`/api/billing/checkout-tier`) and an additional seat (`/api/billing/checkout-seat`)
are both one-time Razorpay orders. Fulfilment (`pawos_apply_plan_purchase`, `pawos_apply_seat_purchase`)
sets `organizations.tier` / `seat_count` permanently. Separately, every active member of a Team
organization gets a fresh usage allowance each calendar month
(`20261004070000_team_seat_usage.sql`). Nothing connects the two: there is no paid-through date, so
one payment funds allowances that renew indefinitely.

## Rules this design keeps

- Team Standard $20 per seat per month; Team Premium $100 per seat per month. Enterprise: contact sales.
- Credits are separate from seats.
- Each member's allowance is their own (Standard = the Pro allowance, Premium = the Pro Max 5x allowance).
- Prices are calculated on the server; a payment is verified before anything is granted; a payment is applied once.

## 1. Billing entity: one subscription per organization and seat tier

A Razorpay **subscription** with `quantity = seats`, on the existing plan ids (`teamStandard`,
`teamPremium` — `getRazorpayPlanId` already resolves them). An organization with both seat tiers has
two subscriptions. The owner or a billing administrator is the buyer.

New table (service-role only, RLS on, no client grants):

```sql
create table public.organization_subscriptions (
  id text primary key,                         -- Razorpay subscription id
  organization_id uuid not null references public.organizations(id) on delete cascade,
  seat_tier text not null check (seat_tier in ('standard', 'premium')),
  seats integer not null check (seats between 1 and 100000),
  status text not null check (status in ('created', 'active', 'past_due', 'cancelled', 'ended')),
  current_period_start timestamptz,
  current_period_end timestamptz,              -- the paid-through date
  grace_until timestamptz,                     -- set when a renewal fails
  cancel_at_period_end boolean not null default false,
  buyer_user_id uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, seat_tier)
);

create table public.organization_subscription_events (
  event_id text primary key,                   -- Razorpay event id: an event is applied once
  subscription_id text not null,
  event_type text not null,
  occurred_at timestamptz not null,            -- Razorpay's own timestamp, for ordering
  payment_id text,
  applied_at timestamptz not null default now()
);
```

`organizations.seat_count` and `paid_premium_seats` become **derived**: the sum of `seats` over
subscriptions that are entitled right now (see section 4), plus grandfathered seats (section 9).

## 2. Creating a subscription

`POST /api/billing/checkout` (the existing subscription route), with the Team gate replaced by:

1. Signed-in caller; must own the organization or hold a seat-buyer role (the set
   `seatPurchase.ts` already uses). Checked as the caller, so row level security applies.
2. Organization email rule (already in the route) stays.
3. Seat tier in {standard, premium}; seats an integer within limits. The price is the plan's; the
   request carries no amount.
4. Refuse if the organization already has a non-ended subscription for that seat tier (quantity
   changes go through section 7).
5. Create the Razorpay subscription with `quantity`, and notes `{ productType: "team_subscription",
   organizationId, seatTier, seats, userId }`. Insert the row with status `created`.

Enterprise stays refused here.

## 3. First payment

`POST /api/billing/verify-subscription` (existing) verifies the Checkout signature, fetches the
subscription and its first payment from Razorpay, and requires: status `active`/`authenticated`,
payment `captured`, plan id = the expected Team plan, quantity = the row's seats. Then, in one
database function (`pawos_apply_team_subscription_payment`, service-role only):

- record the payment id in `organization_subscription_events` (unique → applied once);
- set `status = 'active'`, `current_period_start/end` from Razorpay's `current_start/current_end`;
- create the organization and owner membership if the buyer has none (the logic in
  `verify-tier-payment` today, moved inside the awaited path — never fire-and-forget).

The response is sent only after this succeeds; a failure returns a retryable error and the webhook
(section 5) completes it.

## 4. Entitlement: seats require a paid period

One function decides, and everything reads it:

```sql
-- Seats of p_seat_tier the organization is entitled to at p_at.
pawos_org_entitled_seats(p_organization_id uuid, p_seat_tier text, p_at timestamptz) returns integer
  = sum(seats) over subscriptions where status in ('active', 'past_due')
      and p_at < coalesce(grace_until, current_period_end)
  + grandfathered seats still valid at p_at
```

Used by:

- `pawos_ensure_plan_buckets` — a member's monthly seat bucket is created only if their seat is
  within the entitled count, and the bucket's `expires_at` is `least(month end, paid-through)`.
- The seat-limit trigger on `organization_members` (already compares active members to `seat_count`).
- `pawos_derive_entitlement_tier` — a Team member whose organization has no entitled seats derives `go`.

Members are never deleted by billing; they lose the seat's allowance and Team features until the
organization is paid again.

## 5. Webhooks

The existing `/api/billing/webhook` verifies Razorpay's signature. For `team_subscription`:

| Event | Effect |
|---|---|
| `subscription.activated` | Same as section 3 (covers a client that never reported back) |
| `subscription.charged` | New period: set `current_period_start/end`, `status = 'active'`, clear `grace_until` |
| `subscription.pending` / `subscription.halted` | `status = 'past_due'`, `grace_until = current_period_end + 7 days` |
| `subscription.cancelled` | `cancel_at_period_end = true`; `status = 'cancelled'`; access continues to `current_period_end` |
| `subscription.completed` | `status = 'ended'` |
| `payment.refunded` / dispute | No automatic change; written to `payment_events` for manual review |

Idempotency and ordering:

- Each event id is inserted into `organization_subscription_events` first; a duplicate does nothing.
- An event older (`occurred_at`) than the newest applied event for that subscription cannot move
  `current_period_end` backwards or revive an ended subscription.
- A handler that fails returns 5xx so Razorpay retries; one that is not applicable returns 200.

A daily job (or the existing bucket maintenance) reconciles: for each non-ended subscription, fetch
it from Razorpay and correct `status` / period if a webhook was lost.

## 6. Failed renewal, grace, suspension

- Razorpay retries the charge itself. PawOS marks `past_due` and gives 7 days' grace (configurable).
- During grace: full access; owner and billing administrators see a banner and get an email.
- After grace: seats are not entitled (section 4). Data and memberships are kept.
- A later successful charge restores access from that moment; no back-billing.

## 7. Changing seat quantity

- **More seats:** update the Razorpay subscription quantity with proration charged now
  (`schedule_change_at: "now"`), verify the proration payment, then raise `seats`. This replaces
  `/api/billing/checkout-seat`; the pause is lifted only when this exists.
- **Fewer seats:** scheduled for the end of the period (`schedule_change_at: "cycle_end"`); refused
  if active members of that tier exceed the new count at that time.
- Seat tier change for a member: effective next period (as today).

## 8. Cancellation, refunds, disputes

- Cancel = end of term: access to `current_period_end`, then seats lapse.
- Refunds and disputes are handled by support. A refund does not automatically remove access;
  support ends the subscription. Every such event is recorded for reconciliation.

## 9. Existing organizations and seats already sold

To be decided with the counts from the historical audit (`organization_plan_purchases`,
`organization_seat_purchases`):

- Each existing paid seat becomes a **grandfathered grant**: `organization_seat_grants
  (organization_id, seat_tier, seats, valid_until, source_payment_id)`.
- `valid_until` is a business decision — recommended: one paid month from purchase, extended to a
  single announced cut-over date so nobody loses access without notice.
- Before cut-over, owners are invited to start a subscription; their grants then end as the
  subscription starts.
- No historical row is rewritten and nobody is charged without starting a subscription themselves.

## 10. What customers see

- Organization billing page: plan, seats, next renewal date, payment status (Active / Payment
  failed — retrying until … / Cancelled — access until …), invoices.
- A failed renewal and a pending cancellation are shown to the owner and billing administrators only.
- Members see only that their seat is active or inactive, never amounts.

## 11. Rollout

1. Migration: the two tables, `organization_seat_grants`, the entitlement function, the
   subscription-payment function; `pawos_ensure_plan_buckets`, the seat trigger and the tier
   derivation switched to the entitlement function. Applied to staging first.
2. Backfill grants from the two purchase tables (dry run, then real) — access must be unchanged
   the moment the migration lands.
3. Web: checkout, verify-subscription and webhook changes behind a server flag, off.
4. Tests: database (periods, grace, ordering, replays, grandfathering), route (authorization,
   pricing, gates), webhook (each event, duplicates, out-of-order).
5. Razorpay test mode end to end: create, renew (test clock), fail, recover, cancel, change quantity.
6. Turn the flag on; lift the Team gate and the seat pause together.

## Not in scope

Annual Team billing, Enterprise self-service, automatic refunds, usage-based seat pricing.
