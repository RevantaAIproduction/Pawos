-- Migration: 20260916000000_pawos_build_cohort
-- Description: Private cohort implementation for PawOS Build

-- 1. Table: pawos_build_cohort
CREATE TABLE IF NOT EXISTS pawos_build_cohort (
    user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    cohort_id text NOT NULL DEFAULT 'pilot-2026',
    is_active boolean NOT NULL DEFAULT false,
    cohort_start_date timestamptz,
    cohort_end_date timestamptz,
    included_pc numeric NOT NULL DEFAULT 500 CHECK (included_pc >= 0),
    purchased_pc numeric NOT NULL DEFAULT 0 CHECK (purchased_pc >= 0),
    exhausted_at timestamptz,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE pawos_build_cohort ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own build cohort state" 
ON pawos_build_cohort FOR SELECT 
TO authenticated
USING (auth.uid() = user_id);

-- Admins / Service role can do everything else. Authenticated users cannot mutate this table directly.

-- 2. Table: pawos_build_usage_events (Analytics)
CREATE TABLE IF NOT EXISTS pawos_build_usage_events (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    cohort_id text NOT NULL,
    event_type text NOT NULL CHECK (event_type IN ('consume', 'replenish', 'purchase', 'exhausted')),
    workload_type text CHECK (workload_type IN ('coding', 'conversation', 'resume_ats', 'resume_rewrite') OR workload_type IS NULL),
    pc_amount numeric NOT NULL DEFAULT 0,
    balance_source text CHECK (balance_source IN ('included', 'purchased') OR balance_source IS NULL),
    provider_metadata jsonb,
    created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE pawos_build_usage_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own build usage events" 
ON pawos_build_usage_events FOR SELECT 
TO authenticated
USING (auth.uid() = user_id);

-- No direct inserts by users. Only via RPC.

-- 3. Trigger for updated_at
CREATE OR REPLACE FUNCTION update_pawos_build_cohort_updated_at()
RETURNS trigger AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS pawos_build_cohort_updated_at_trigger ON pawos_build_cohort;
CREATE TRIGGER pawos_build_cohort_updated_at_trigger
    BEFORE UPDATE ON pawos_build_cohort
    FOR EACH ROW
    EXECUTE FUNCTION update_pawos_build_cohort_updated_at();


-- 4. RPC: get_pawos_build_state()
CREATE OR REPLACE FUNCTION get_pawos_build_state()
RETURNS json AS $$
DECLARE
    v_user_id uuid := auth.uid();
    v_cohort RECORD;
    v_replenished boolean := false;
BEGIN
    IF v_user_id IS NULL THEN
        RAISE EXCEPTION 'Not authenticated';
    END IF;

    -- Lock the row to prevent concurrent race conditions during replenishment
    SELECT * INTO v_cohort FROM public.pawos_build_cohort WHERE user_id = v_user_id FOR UPDATE;

    IF NOT FOUND THEN
        RETURN json_build_object('active', false);
    END IF;

    IF NOT v_cohort.is_active THEN
        RETURN json_build_object('active', false);
    END IF;

    -- Cohort expiry check (if end date exists and has passed)
    IF v_cohort.cohort_end_date IS NOT NULL AND now() > v_cohort.cohort_end_date THEN
        RETURN json_build_object('active', false, 'reason', 'cohort_ended');
    END IF;

    -- Check 72-hour replenishment
    IF v_cohort.exhausted_at IS NOT NULL AND (now() >= (v_cohort.exhausted_at + interval '72 hours')) THEN
        -- Replenish
        UPDATE public.pawos_build_cohort 
        SET included_pc = 500, exhausted_at = NULL
        WHERE user_id = v_user_id
        RETURNING * INTO v_cohort;
        
        -- Log analytics event
        INSERT INTO public.pawos_build_usage_events (
            user_id, cohort_id, event_type, workload_type, pc_amount, balance_source
        ) VALUES (
            v_user_id, v_cohort.cohort_id, 'replenish', NULL, 500, 'included'
        );

        v_replenished := true;
    END IF;

    RETURN json_build_object(
        'active', true,
        'includedPc', v_cohort.included_pc,
        'purchasedPc', v_cohort.purchased_pc,
        'exhaustedAt', v_cohort.exhausted_at,
        'replenishedJustNow', v_replenished
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Hardening EXECUTE privileges
REVOKE EXECUTE ON FUNCTION get_pawos_build_state() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION get_pawos_build_state() TO authenticated;


-- 5. RPC: consume_pawos_build_pc()
CREATE OR REPLACE FUNCTION consume_pawos_build_pc(
    p_amount numeric, 
    p_workload_type text, 
    p_balance_preference text, -- 'included' or 'purchased'
    p_metadata jsonb DEFAULT '{}'::jsonb
)
RETURNS json AS $$
DECLARE
    v_user_id uuid := auth.uid();
    v_cohort RECORD;
BEGIN
    IF v_user_id IS NULL THEN
        RAISE EXCEPTION 'Not authenticated';
    END IF;

    IF p_amount <= 0 THEN
        RAISE EXCEPTION 'Consumption amount must be strictly positive';
    END IF;

    IF p_balance_preference NOT IN ('included', 'purchased') THEN
        RAISE EXCEPTION 'Invalid balance preference. Must be "included" or "purchased"';
    END IF;

    -- Ensure we process any pending replenishment before consuming!
    PERFORM public.get_pawos_build_state();

    -- Lock the row
    SELECT * INTO v_cohort FROM public.pawos_build_cohort WHERE user_id = v_user_id FOR UPDATE;

    IF NOT FOUND OR NOT v_cohort.is_active THEN
        RAISE EXCEPTION 'User does not have active PawOS Build cohort access';
    END IF;

    IF v_cohort.cohort_end_date IS NOT NULL AND now() > v_cohort.cohort_end_date THEN
        RAISE EXCEPTION 'Build cohort has ended';
    END IF;

    IF p_balance_preference = 'included' THEN
        IF v_cohort.included_pc < p_amount THEN
            RAISE EXCEPTION 'Insufficient included PC. Balance: %, Requested: %', v_cohort.included_pc, p_amount;
        END IF;

        UPDATE public.pawos_build_cohort 
        SET included_pc = included_pc - p_amount
        WHERE user_id = v_user_id
        RETURNING * INTO v_cohort;

        -- Log consumption
        INSERT INTO public.pawos_build_usage_events (
            user_id, cohort_id, event_type, workload_type, pc_amount, balance_source, provider_metadata
        ) VALUES (
            v_user_id, v_cohort.cohort_id, 'consume', p_workload_type, p_amount, 'included', p_metadata
        );

        -- Trigger exhaustion if exactly 0
        IF v_cohort.included_pc = 0 AND v_cohort.exhausted_at IS NULL THEN
            UPDATE public.pawos_build_cohort 
            SET exhausted_at = now()
            WHERE user_id = v_user_id
            RETURNING * INTO v_cohort;

            -- Log exhaustion
            INSERT INTO public.pawos_build_usage_events (
                user_id, cohort_id, event_type, workload_type, pc_amount, balance_source
            ) VALUES (
                v_user_id, v_cohort.cohort_id, 'exhausted', p_workload_type, 0, 'included'
            );
        END IF;

    ELSIF p_balance_preference = 'purchased' THEN
        IF v_cohort.purchased_pc < p_amount THEN
            RAISE EXCEPTION 'Insufficient purchased PC. Balance: %, Requested: %', v_cohort.purchased_pc, p_amount;
        END IF;

        UPDATE public.pawos_build_cohort 
        SET purchased_pc = purchased_pc - p_amount
        WHERE user_id = v_user_id
        RETURNING * INTO v_cohort;

        -- Log consumption
        INSERT INTO public.pawos_build_usage_events (
            user_id, cohort_id, event_type, workload_type, pc_amount, balance_source, provider_metadata
        ) VALUES (
            v_user_id, v_cohort.cohort_id, 'consume', p_workload_type, p_amount, 'purchased', p_metadata
        );
    END IF;

    RETURN json_build_object(
        'success', true,
        'includedPc', v_cohort.included_pc,
        'purchasedPc', v_cohort.purchased_pc,
        'exhaustedAt', v_cohort.exhausted_at
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Hardening EXECUTE privileges
REVOKE EXECUTE ON FUNCTION consume_pawos_build_pc(numeric, text, text, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION consume_pawos_build_pc(numeric, text, text, jsonb) TO authenticated;


-- 6. RPC: purchase_pawos_build_credits()
-- Trusted backend payment fulfillment only. Normal users MUST NOT EXECUTE THIS.
CREATE OR REPLACE FUNCTION purchase_pawos_build_credits(
    p_target_user_id uuid,
    p_amount numeric
)
RETURNS void AS $$
DECLARE
    v_cohort_id text;
BEGIN
    IF p_amount <= 0 THEN
        RAISE EXCEPTION 'Purchase amount must be positive';
    END IF;

    SELECT cohort_id INTO v_cohort_id FROM public.pawos_build_cohort WHERE user_id = p_target_user_id FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'User does not belong to a PawOS Build cohort';
    END IF;

    UPDATE public.pawos_build_cohort
    SET purchased_pc = purchased_pc + p_amount
    WHERE user_id = p_target_user_id;

    INSERT INTO public.pawos_build_usage_events (
        user_id, cohort_id, event_type, workload_type, pc_amount, balance_source
    ) VALUES (
        p_target_user_id, v_cohort_id, 'purchase', NULL, p_amount, 'purchased'
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- EXPLICIT HARDENING: Deny to everyone, allow ONLY service_role
REVOKE EXECUTE ON FUNCTION purchase_pawos_build_credits(uuid, numeric) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION purchase_pawos_build_credits(uuid, numeric) FROM authenticated;
REVOKE EXECUTE ON FUNCTION purchase_pawos_build_credits(uuid, numeric) FROM anon;
GRANT EXECUTE ON FUNCTION purchase_pawos_build_credits(uuid, numeric) TO service_role;