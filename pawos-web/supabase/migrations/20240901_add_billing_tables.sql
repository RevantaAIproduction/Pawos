-- Supabase Billing Migration – security‑focused, safe‑upgrade version

-- 1️⃣ payment_events          – **server‑only** (service_role only)
-- 2️⃣ saved_payment_methods   – **server‑only** (service_role only)
-- 3️⃣ billing_history         – client‑readable only if the UI already
--                               reads it directly from Supabase;
--                               otherwise the backend API can be used.
-- 4️⃣ invoices                – visible to organization owners / admins

-- NOTE: All CREATE … IF NOT EXISTS blocks are followed by
--       ALTER … ADD COLUMN IF NOT EXISTS so that the migration works
--       on an existing schema that may already have some of the columns.
--       Columns that are required for new rows are added **nullable**
--       first; a later step (commented) shows how to make them NOT NULL
--       after a back‑fill if you ever need that constraint.

--------------------------------------------------------------------
-- 1️⃣ payment_events  (backend‑only)
--------------------------------------------------------------------
DO $$
BEGIN
  -- Create the table if it does not exist
  IF NOT EXISTS (
        SELECT FROM information_schema.tables
        WHERE table_schema = 'public' AND table_name = 'payment_events'
      ) THEN
    CREATE TABLE public.payment_events (
      id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      razorpay_payment_id    text,
      razorpay_order_id      text,
      razorpay_subscription_id text,
      webhook_event_id       text NOT NULL,
      user_id                uuid NOT NULL,
      organization_id        uuid,
      event_type             text NOT NULL,
      amount                 numeric NOT NULL,
      currency               text NOT NULL,
      created_at             timestamp with time zone DEFAULT now()
    );
    CREATE UNIQUE INDEX IF NOT EXISTS uq_payment_events_webhook_event_id
      ON public.payment_events (webhook_event_id);
  END IF;

  -- Add any missing columns (nullable)
  ALTER TABLE public.payment_events
    ADD COLUMN IF NOT EXISTS razorpay_payment_id    text,
    ADD COLUMN IF NOT EXISTS razorpay_order_id      text,
    ADD COLUMN IF NOT EXISTS razorpay_subscription_id text,
    ADD COLUMN IF NOT EXISTS webhook_event_id       text,
    ADD COLUMN IF NOT EXISTS user_id                uuid,
    ADD COLUMN IF NOT EXISTS organization_id        uuid,
    ADD COLUMN IF NOT EXISTS event_type             text,
    ADD COLUMN IF NOT EXISTS amount                 numeric,
    ADD COLUMN IF NOT EXISTS currency               text,
    ADD COLUMN IF NOT EXISTS created_at             timestamp with time zone DEFAULT now();

  REVOKE ALL ON TABLE public.payment_events FROM anon, authenticated;
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.payment_events TO service_role;
END $$;

--------------------------------------------------------------------
-- 2️⃣ saved_payment_methods  (backend‑only, sensitive data)
--------------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (
        SELECT FROM information_schema.tables
        WHERE table_schema = 'public' AND table_name = 'saved_payment_methods'
      ) THEN
    CREATE TABLE public.saved_payment_methods (
      id                         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id                    uuid NOT NULL,
      organization_id            uuid,
      method_type                text NOT NULL,
      provider_payment_method_id text NOT NULL,
      last4                      text,
      expiry_month               int,
      expiry_year                int,
      created_at                 timestamp with time zone DEFAULT now()
    );
  END IF;

  ALTER TABLE public.saved_payment_methods
    ADD COLUMN IF NOT EXISTS user_id                    uuid,
    ADD COLUMN IF NOT EXISTS organization_id            uuid,
    ADD COLUMN IF NOT EXISTS method_type                text,
    ADD COLUMN IF NOT EXISTS provider_payment_method_id text,
    ADD COLUMN IF NOT EXISTS last4                      text,
    ADD COLUMN IF NOT EXISTS expiry_month               int,
    ADD COLUMN IF NOT EXISTS expiry_year                int,
    ADD COLUMN IF NOT EXISTS created_at                 timestamp with time zone DEFAULT now();

  REVOKE ALL ON TABLE public.saved_payment_methods FROM anon, authenticated;
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.saved_payment_methods TO service_role;
  CREATE INDEX IF NOT EXISTS idx_saved_payment_methods_user_id ON public.saved_payment_methods(user_id);
END $$;

--------------------------------------------------------------------
-- 3️⃣ billing_history  (client‑readable only if the UI already uses it)
--------------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (
        SELECT FROM information_schema.tables
        WHERE table_schema = 'public' AND table_name = 'billing_history'
      ) THEN
    CREATE TABLE public.billing_history (
      id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      payment_event_id uuid REFERENCES public.payment_events(id) NOT NULL,
      user_id          uuid NOT NULL,
      organization_id  uuid,
      product_type     text NOT NULL,
      amount           numeric NOT NULL,
      currency         text NOT NULL,
      status           text NOT NULL,
      created_at       timestamp with time zone DEFAULT now()
    );
  END IF;

  ALTER TABLE public.billing_history
    ADD COLUMN IF NOT EXISTS payment_event_id uuid REFERENCES public.payment_events(id),
    ADD COLUMN IF NOT EXISTS user_id          uuid,
    ADD COLUMN IF NOT EXISTS organization_id  uuid,
    ADD COLUMN IF NOT EXISTS product_type     text,
    ADD COLUMN IF NOT EXISTS amount           numeric,
    ADD COLUMN IF NOT EXISTS currency         text,
    ADD COLUMN IF NOT EXISTS status           text,
    ADD COLUMN IF NOT EXISTS created_at       timestamp with time zone DEFAULT now();

  CREATE INDEX IF NOT EXISTS idx_billing_history_user_id ON public.billing_history(user_id);
END $$;

DO $$
DECLARE pol_exists int;
BEGIN
  SELECT COUNT(*) INTO pol_exists FROM pg_policy p JOIN pg_class c ON p.polrelid = c.oid JOIN pg_namespace n ON c.relnamespace = n.oid WHERE n.nspname = 'public' AND c.relname = 'billing_history' AND p.polname = 'billing_history_user_select';
  IF pol_exists = 0 THEN
    CREATE POLICY billing_history_user_select ON public.billing_history
      FOR SELECT USING (
        auth.uid() = user_id OR (
          organization_id IS NOT NULL AND EXISTS (
            SELECT 1 FROM organization_members om
            WHERE om.organization_id = billing_history.organization_id
              AND om.user_id = auth.uid()
              AND om.role = ANY('{owner,admin}'::text[])
          )
        )
      );
  END IF;
END $$;

ALTER TABLE public.billing_history ENABLE ROW LEVEL SECURITY;

--------------------------------------------------------------------
-- 4️⃣ invoices  (visible to owners / admins)
--------------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (
        SELECT FROM information_schema.tables
        WHERE table_schema = 'public' AND table_name = 'invoices'
      ) THEN
    CREATE TABLE public.invoices (
      id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      organization_id       uuid NOT NULL,
      billing_period_start  date NOT NULL,
      billing_period_end    date NOT NULL,
      total_amount          numeric NOT NULL,
      currency              text NOT NULL,
      pdf_url               text,
      created_at            timestamp with time zone DEFAULT now()
    );
  END IF;

  ALTER TABLE public.invoices
    ADD COLUMN IF NOT EXISTS organization_id       uuid,
    ADD COLUMN IF NOT EXISTS billing_period_start  date,
    ADD COLUMN IF NOT EXISTS billing_period_end    date,
    ADD COLUMN IF NOT EXISTS total_amount          numeric,
    ADD COLUMN IF NOT EXISTS currency              text,
    ADD COLUMN IF NOT EXISTS pdf_url               text,
    ADD COLUMN IF NOT EXISTS created_at            timestamp with time zone DEFAULT now();

  CREATE INDEX IF NOT EXISTS idx_invoices_org_id ON public.invoices(organization_id);
END $$;

DO $$
DECLARE pol_exists int;
BEGIN
  SELECT COUNT(*) INTO pol_exists FROM pg_policy p JOIN pg_class c ON p.polrelid = c.oid JOIN pg_namespace n ON c.relnamespace = n.oid WHERE n.nspname = 'public' AND c.relname = 'invoices' AND p.polname = 'invoices_org_select';
  IF pol_exists = 0 THEN
    CREATE POLICY invoices_org_select ON public.invoices
      FOR SELECT USING (
        EXISTS (
          SELECT 1 FROM organization_members om
          WHERE om.organization_id = invoices.organization_id
            AND om.user_id = auth.uid()
            AND om.role = ANY('{owner,admin}'::text[])
        )
      );
  END IF;
END $$;

ALTER TABLE public.invoices ENABLE ROW LEVEL SECURITY;

-- Safety: no other objects touched.
