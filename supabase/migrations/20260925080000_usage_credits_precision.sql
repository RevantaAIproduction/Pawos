-- Migration: 20260925080000_usage_credits_precision
--
-- Purchased Paw Compute (Usage Credits) balances were stored in whole cents — numeric(10,2) — while a
-- typical conversation turn costs a fraction of a cent ($1 = 100 PC, so 0.3 PC = $0.003). Every such
-- deduction rounded to $0.00: the balance never went down and the charge was recorded as zero, so
-- purchased credits were effectively unlimited. Store amounts to 6 decimal places (millionths of a
-- dollar) so every deduction is real. Existing values are unchanged (widening only).

alter table public.user_usage_credits alter column balance_usd type numeric(14, 6);
alter table public.usage_credit_deductions alter column amount_usd type numeric(14, 6);
