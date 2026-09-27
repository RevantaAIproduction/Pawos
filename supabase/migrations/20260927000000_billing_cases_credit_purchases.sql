-- Purchases above Razorpay's ₹50,000 one-time order limit are paid by invoice, and that includes
-- Ticket Wallet and usage-credit purchases (personal or for an organization) — not only Team/Enterprise
-- plans. billing_cases.tier only allowed 'team' / 'enterprise', so a credit purchase's case was rejected.
-- Replaces the tier check (whatever it is named) with one that also allows 'credit-purchase'.
-- Non-destructive: no rows or columns change.

do $$
declare
  constraint_name text;
begin
  for constraint_name in
    select con.conname
    from pg_constraint con
    join pg_class rel on rel.oid = con.conrelid
    join pg_namespace nsp on nsp.oid = rel.relnamespace
    where nsp.nspname = 'public'
      and rel.relname = 'billing_cases'
      and con.contype = 'c'
      and pg_get_constraintdef(con.oid) ~* '\mtier\M'
  loop
    execute format('alter table public.billing_cases drop constraint %I', constraint_name);
  end loop;
end
$$;

alter table public.billing_cases
  add constraint billing_cases_tier_check
  check (tier in ('team', 'enterprise', 'credit-purchase'));
