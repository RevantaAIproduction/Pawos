CREATE TABLE IF NOT EXISTS pawos_build_reservations (
    run_id text PRIMARY KEY,
    user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    cohort_id text NOT NULL,
    workload_type text NOT NULL CHECK (workload_type IN ('coding', 'conversation', 'resume_ats', 'resume_rewrite')),
    balance_source text NOT NULL CHECK (balance_source IN ('included', 'purchased')),
    reserved_amount numeric NOT NULL CHECK (reserved_amount >= 0),
    caused_exhaustion boolean NOT NULL DEFAULT false,
    status text NOT NULL DEFAULT 'reserved' CHECK (status IN ('reserved', 'settled', 'released')),
    created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE pawos_build_reservations ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON pawos_build_reservations FROM authenticated, anon, public;
GRANT ALL ON pawos_build_reservations TO service_role;

CREATE OR REPLACE FUNCTION reserve_pawos_build_pc(
    p_run_id text,
    p_amount numeric,
    p_workload_type text,
    p_balance_preference text
)
RETURNS jsonb AS $BODY
DECLARE
    v_cohort pawos_build_cohort%ROWTYPE;
    v_existing pawos_build_reservations%ROWTYPE;
    v_causes_exhaustion boolean := false;
BEGIN
    IF p_amount <= 0 THEN
        RAISE EXCEPTION 'Reservation amount must be positive';
    END IF;

    -- 1. Idempotency Check BEFORE cohort mutation
    SELECT * INTO v_existing FROM public.pawos_build_reservations WHERE run_id = p_run_id;
    IF FOUND THEN
        IF v_existing.workload_type = p_workload_type AND 
           v_existing.balance_source = p_balance_preference AND 
           v_existing.reserved_amount = p_amount THEN
            RETURN json_build_object('ok', true, 'reserved', v_existing.reserved_amount, 'status', v_existing.status);
        ELSE
            RAISE EXCEPTION 'Reservation run_id exists with different parameters';
        END IF;
    END IF;

    -- 2. New Run: Lock Cohort
    SELECT * INTO v_cohort FROM public.pawos_build_cohort WHERE user_id = auth.uid() FOR UPDATE;
    
    IF NOT FOUND OR NOT v_cohort.is_active THEN
        RAISE EXCEPTION 'User does not have active PawOS Build cohort access';
    END IF;

    -- 3. Hard Cohort Boundary
    IF v_cohort.cohort_end_date IS NOT NULL AND now() >= v_cohort.cohort_end_date THEN
        RAISE EXCEPTION 'Build cohort has ended';
    END IF;

    -- 4. Replenishment (only if not expired)
    IF v_cohort.exhausted_at IS NOT NULL AND (now() >= (v_cohort.exhausted_at + interval '72 hours')) THEN
        UPDATE public.pawos_build_cohort 
        SET included_pc = 500, exhausted_at = NULL
        WHERE user_id = auth.uid()
        RETURNING * INTO v_cohort;
    END IF;

    -- 5. Deduct Balance
    IF p_balance_preference = 'included' THEN
        IF v_cohort.included_pc < p_amount THEN
            RAISE EXCEPTION 'Insufficient included PC. Balance: %, Requested: %', v_cohort.included_pc, p_amount;
        END IF;
        
        IF (v_cohort.included_pc - p_amount) = 0 AND v_cohort.exhausted_at IS NULL THEN
            v_causes_exhaustion := true;
        END IF;

        UPDATE public.pawos_build_cohort 
        SET included_pc = included_pc - p_amount,
            exhausted_at = CASE WHEN v_causes_exhaustion THEN now() ELSE exhausted_at END
        WHERE user_id = auth.uid();
    ELSIF p_balance_preference = 'purchased' THEN
        IF v_cohort.purchased_pc < p_amount THEN
            RAISE EXCEPTION 'Insufficient purchased PC. Balance: %, Requested: %', v_cohort.purchased_pc, p_amount;
        END IF;
        
        UPDATE public.pawos_build_cohort 
        SET purchased_pc = purchased_pc - p_amount
        WHERE user_id = auth.uid();
    ELSE
        RAISE EXCEPTION 'Invalid balance preference';
    END IF;

    -- 6. Insert Reservation
    INSERT INTO public.pawos_build_reservations (run_id, user_id, cohort_id, workload_type, balance_source, reserved_amount, caused_exhaustion, status)
    VALUES (p_run_id, auth.uid(), v_cohort.cohort_id, p_workload_type, p_balance_preference, p_amount, v_causes_exhaustion, 'reserved');

    RETURN json_build_object('ok', true, 'reserved', p_amount, 'status', 'reserved');
END;
$BODY LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

GRANT EXECUTE ON FUNCTION reserve_pawos_build_pc(text, numeric, text, text) TO authenticated;

CREATE OR REPLACE FUNCTION settle_pawos_build_pc(
    p_run_id text,
    p_actual_amount numeric
)
RETURNS jsonb AS $BODY
DECLARE
    v_res pawos_build_reservations%ROWTYPE;
    v_refund numeric;
    v_cohort pawos_build_cohort%ROWTYPE;
BEGIN
    IF p_actual_amount < 0 THEN
        RAISE EXCEPTION 'Actual amount cannot be negative';
    END IF;

    SELECT * INTO v_res FROM public.pawos_build_reservations WHERE run_id = p_run_id AND user_id = auth.uid() FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Reservation not found';
    END IF;

    IF v_res.status = 'settled' OR v_res.status = 'released' THEN
        RETURN json_build_object('ok', true, 'status', v_res.status);
    END IF;
    
    IF p_actual_amount > v_res.reserved_amount THEN
        v_refund := 0;
        p_actual_amount := v_res.reserved_amount;
    ELSE
        v_refund := v_res.reserved_amount - p_actual_amount;
    END IF;

    SELECT * INTO v_cohort FROM public.pawos_build_cohort WHERE user_id = auth.uid() FOR UPDATE;

    IF v_refund > 0 THEN
        IF v_res.balance_source = 'included' THEN
            -- Settling with a refund does NOT reset the exhaustion clock!
            UPDATE public.pawos_build_cohort 
            SET included_pc = included_pc + v_refund
            WHERE user_id = auth.uid();
        ELSIF v_res.balance_source = 'purchased' THEN
            UPDATE public.pawos_build_cohort 
            SET purchased_pc = purchased_pc + v_refund
            WHERE user_id = auth.uid();
        END IF;
    END IF;

    UPDATE public.pawos_build_reservations SET status = 'settled' WHERE run_id = p_run_id;

    INSERT INTO public.pawos_build_usage_events (user_id, cohort_id, event_type, workload_type, pc_amount, balance_source)
    VALUES (auth.uid(), v_res.cohort_id, 'consume', v_res.workload_type, p_actual_amount, v_res.balance_source);

    RETURN json_build_object('ok', true, 'refunded', v_refund, 'settled', p_actual_amount, 'status', 'settled');
END;
$BODY LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

GRANT EXECUTE ON FUNCTION settle_pawos_build_pc(text, numeric) TO authenticated;

CREATE OR REPLACE FUNCTION release_pawos_build_pc(
    p_run_id text
)
RETURNS jsonb AS $BODY
DECLARE
    v_res pawos_build_reservations%ROWTYPE;
    v_cohort pawos_build_cohort%ROWTYPE;
BEGIN
    SELECT * INTO v_res FROM public.pawos_build_reservations WHERE run_id = p_run_id AND user_id = auth.uid() FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Reservation not found';
    END IF;

    IF v_res.status = 'settled' OR v_res.status = 'released' THEN
        RETURN json_build_object('ok', true, 'status', v_res.status);
    END IF;

    SELECT * INTO v_cohort FROM public.pawos_build_cohort WHERE user_id = auth.uid() FOR UPDATE;

    IF v_res.balance_source = 'included' THEN
        UPDATE public.pawos_build_cohort 
        SET included_pc = included_pc + v_res.reserved_amount,
            exhausted_at = CASE WHEN v_res.caused_exhaustion THEN NULL ELSE exhausted_at END
        WHERE user_id = auth.uid();
    ELSIF v_res.balance_source = 'purchased' THEN
        UPDATE public.pawos_build_cohort 
        SET purchased_pc = purchased_pc + v_res.reserved_amount
        WHERE user_id = auth.uid();
    END IF;

    UPDATE public.pawos_build_reservations SET status = 'released' WHERE run_id = p_run_id;

    RETURN json_build_object('ok', true, 'released', v_res.reserved_amount, 'status', 'released');
END;
$BODY LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

GRANT EXECUTE ON FUNCTION release_pawos_build_pc(text) TO authenticated;
