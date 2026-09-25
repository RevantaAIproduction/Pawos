-- Migration: 20260925110000_ticket_topups_enable
--
-- Re-enables Ticket Balance top-ups after the wallet deployment (20260925100000) was verified on
-- production: schema/RLS/functions/triggers/indexes, crediting + duplicate-payment protection,
-- completion / cancellation / failure charging, waiting-for-top-up resume, and caller authorization.
-- To pause top-ups again (maintenance):
--   update public.pawos_billing_switches set enabled = false, updated_at = now() where key = 'ticket_topups';

update public.pawos_billing_switches
set enabled = true, note = 'Enabled after production verification of the Ticket Balance wallet.', updated_at = now()
where key = 'ticket_topups';
