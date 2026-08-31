# Pro Monthly Payment Test Plan

## Test Objective
Verify that the `amountInr → amountPaise` fix resolves the Razorpay "Your payment amount is different from your order amount" error.

## Expected Values for Pro Monthly (₹1,913)
- Razorpay Order Amount: **191300 paise** (₹1,913)
- createPayment() amount: **191300** (changed from 1913)
- Currency: **INR**

## Test Steps

### Step 1: Create Order via Backend
```bash
curl -X POST http://localhost:3000/api/billing/checkout-tier \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN" \
  -d '{
    "tier": "pro",
    "options": {
      "proBillingFrequency": "monthly"
    }
  }'
```

Expected response:
```json
{
  "ok": true,
  "orderId": "order_XXXXXXXXX",
  "amountPaise": 191300,
  "amountInr": 1913,
  "keyId": "rzp_live_XXXX",
  "currency": "INR"
}
```

### Step 2: Open PawOS Checkout UI
- Navigate to: Settings → Billing → Pro → Monthly
- Click "Subscribe"
- Select card payment method

### Step 3: Capture Network Request
- Open DevTools → Network tab
- Look for POST to: `https://api.razorpay.com/v1/payments/create/ajax`
- Verify the payload contains: `"amount": 191300` (NOT 1913)

### Step 4: Submit Card Payment
- Enter test card details
- Click "Pay" button
- Expected: No HTTP 400 error with "amount mismatch"

### Step 5: Verify in Razorpay Dashboard
- Check order status
- Verify order amount = 191300 paise
- Verify payment initiation succeeded

## Pass/Fail Criteria

**PASS**: Payment initialization succeeds without HTTP 400 error
**FAIL**: Still receives "Your payment amount is different from your order amount" error

## Sanitized Error Capture (if occurs)
Do NOT log card details, CVV, JWT, or Razorpay secrets.

If error occurs:
```
HTTP STATUS: 400
code: BAD_REQUEST_ERROR
description: Your payment amount is different from your order amount
step: [CAPTURE FROM RESPONSE]
reason: [CAPTURE FROM RESPONSE]
order_id: order_XXXXXXXXX
```
