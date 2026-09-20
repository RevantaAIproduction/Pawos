import { describe, it, expect } from "vitest";
import { createClient } from "@supabase/supabase-js";
import "dotenv/config";

/**
 * Database Concurrency Tests - Requires real Supabase connection
 * 
 * To run this integration test, you must supply active, valid JWTs for two separate users
 * (to verify cross-account security) along with your project URL and Anon/Publishable key.
 * 
 * Environment Variables required:
 * SUPABASE_URL: e.g. https://your-project.supabase.co
 * SUPABASE_PUBLISHABLE_KEY: e.g. eyJ...
 * TEST_USER_TOKEN_A: Real JWT for User A. User A MUST have exactly $10 in Usage Credits before running.
 * TEST_USER_TOKEN_B: Real JWT for User B (used for cross-account spoofing tests).
 */
const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_PUBLISHABLE_KEY || process.env.VITE_SUPABASE_ANON_KEY;
const userTokenA = process.env.TEST_USER_TOKEN_A;
const userTokenB = process.env.TEST_USER_TOKEN_B;

describe("Supabase RPC Concurrency Tests", () => {
  it("Concurrent deduct_usage_credits executes safely and respects idempotency", async () => {
    const missing = [];
    if (!supabaseUrl) missing.push("SUPABASE_URL");
    if (!supabaseKey) missing.push("SUPABASE_PUBLISHABLE_KEY");
    if (!userTokenA) missing.push("TEST_USER_TOKEN_A");
    if (!userTokenB) missing.push("TEST_USER_TOKEN_B");
    
    if (missing.length > 0) {
      throw new Error(`BLOCKED: Missing Supabase credentials for real integration test. Supply: ${missing.join(", ")}.`);
    }

    const supabaseA = createClient(supabaseUrl, supabaseKey, {
      global: { headers: { Authorization: `Bearer ${userTokenA}` } }
    });
    
    const supabaseB = createClient(supabaseUrl, supabaseKey, {
      global: { headers: { Authorization: `Bearer ${userTokenB}` } }
    });

    // We assume Account A starts with $10 (this would be set up in a real test DB)
    const eventX = "X-" + Date.now();
    const eventY = "Y-" + Date.now();
    
    // Test 1: Concurrency overload ($7 + $7 on $10 balance)
    const res1 = supabaseA.rpc("deduct_usage_credits", { p_amount_usd: 7, p_usage_event_id: eventX });
    const res2 = supabaseA.rpc("deduct_usage_credits", { p_amount_usd: 7, p_usage_event_id: eventY });

    const [r1, r2] = await Promise.all([res1, res2]);
    // One succeeds, one fails with insufficient balance
    expect([r1.error?.message, r2.error?.message].some(m => m?.includes("insufficient"))).toBe(true);
    expect([r1.data, r2.data].some(d => d === 3)).toBe(true);

    // Test 2: Idempotency (same event, same amount)
    const eventZ = "Z-" + Date.now();
    const res3 = supabaseA.rpc("deduct_usage_credits", { p_amount_usd: 1, p_usage_event_id: eventZ });
    const res4 = supabaseA.rpc("deduct_usage_credits", { p_amount_usd: 1, p_usage_event_id: eventZ });
    
    const [r3, r4] = await Promise.all([res3, res4]);
    // Both return 2 (assuming balance was 3, 3-1=2), but only 1 deduction actually occurred
    expect(r3.data).toBe(2);
    expect(r4.data).toBe(2);
    
    // Test 3: Idempotency violation (same event, different amount)
    const r5 = await supabaseA.rpc("deduct_usage_credits", { p_amount_usd: 2, p_usage_event_id: eventZ });
    expect(r5.error?.message).toContain("amount mismatch");

    // Test 4: Cross-account idempotency violation
    const r6 = await supabaseB.rpc("deduct_usage_credits", { p_amount_usd: 1, p_usage_event_id: eventZ });
    expect(r6.error?.message).toContain("belongs to another user");
  });
});