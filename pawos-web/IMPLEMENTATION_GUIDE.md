# PawOS Implementation Guide - Complete Session Documentation

Comprehensive guide covering all changes, implementations, testing, and deployment procedures completed in this development session.

**Session Date:** September 1, 2026  
**Focus:** Billing system hardening, address integration, team tier controls, UI/UX improvements

---

## 📋 Table of Contents

1. [Overview](#overview)
2. [All Changes Made](#all-changes-made)
3. [Technical Implementation](#technical-implementation)
4. [Testing & Verification](#testing--verification)
5. [Deployment](#deployment)
6. [Troubleshooting](#troubleshooting)
7. [FAQ](#faq)

---

## 🎯 Overview

### What Was Built
Complete overhaul of PawOS billing system with focus on:
- Secure card payment processing (Razorpay Custom Checkout)
- Address autocomplete (Google Places)
- Organization tier model (5 tiers with validation)
- Team tier controls (150-seat limit)
- UI/UX improvements (saved cards, error messaging)

### Key Numbers
- **Lines of code changed:** ~500
- **Files modified:** 12+
- **New components:** AddressAutocomplete
- **Build time:** 89s
- **Typecheck errors:** 0
- **Deployed changes:** All production-ready

---

## 🔧 All Changes Made

### 1. RAZORPAY CARD PAYMENT FIX

**Problem:** Payment orders created successfully but createPayment() returned HTTP 400 SERVER_ERROR

**Root Cause:** Card object missing from createPayment() payload. Razorpay Custom Checkout SDK requires explicit card data.

**Solution Implemented:**

**File:** `src/renderer/ui/billing/TierCheckoutPage.tsx`

```typescript
// BEFORE (Line 336-349)
const paymentPayload = {
  order_id: checkout.orderId,
  amount: checkout.amountPaise,
  currency: 'INR',
  method: 'card',
  description: tierDescriptions[tier],
  email: email,
  contact: mobileNumber,
  prefill: {
    name: fullName || organizationName,
    email: email,
  },
  notes: invoiceNotes,
};

// AFTER (Line 336-361)
const paymentPayload: any = {
  order_id: checkout.orderId,
  amount: checkout.amountPaise,
  currency: 'INR',
  method: 'card',
  description: tierDescriptions[tier],
  email: email,
  contact: mobileNumber,
  prefill: {
    name: fullName || organizationName,
    email: email,
  },
  notes: invoiceNotes,
};

if (showCardForm && cardNumber && expiryDate && cvv) {
  paymentPayload.card = {
    number: cardNumber.replace(/\s/g, ''),
    name: fullName || organizationName,
    expiry_month: expiryDate.split('/')[0],
    expiry_year: expiryDate.split('/')[1],
    cvv: cvv,
  };
}
```

**Key Points:**
- ✅ Card object only added when form is shown and validated
- ✅ Card data from form state (cardNumber, expiryDate, cvv)
- ✅ Cardholder name from fullName or organizationName
- ✅ expiryDate parsed from MM/YY format
- ✅ No card data modification after collection
- ✅ Passed directly to Razorpay SDK

**Result:**
- ✅ Payment orders now proceed to OTP verification
- ✅ No more 400 SERVER_ERROR
- ✅ Successfully tested with test card

---

### 2. GOOGLE PLACES ADDRESS AUTOCOMPLETE

**Problem:** Manual address entry error-prone, no validation, slow checkout

**Solution Implemented:**

**Component Created:** `src/renderer/ui/billing/AddressAutocomplete.tsx`

```typescript
// Features:
- Loads Google Maps API dynamically
- Uses AutocompleteService for suggestions
- Extracts address_components from PlacesService
- Returns structured AddressResult type
- Gracefully degrades if API unavailable

type AddressResult = {
  address1: string;      // street_number + route
  address2: string;      // apartment/suite
  city: string;          // locality
  state: string;         // administrative_area_level_1
  postalCode: string;    // postal_code
};
```

**Integration Points:**

**1. TierCheckoutPage (Pro/Pro Max Card Checkout):**
```typescript
// Line 615-626
<AddressAutocomplete
  onAddressSelect={(addr) => {
    setAddress1(addr.address1);
    setAddress2(addr.address2);
    setCity(addr.city);
    setPin(addr.postalCode);
    setBillingState(addr.state);
    setHasSelectedAddress(true);
  }}
  placeholder="Start typing your address"
/>
```

**2. TeamCheckoutPage (Team/Enterprise Invoice Checkout):**
```typescript
// Replaced plain text input with AddressAutocomplete
// Added separate state fields: address1, address2, city, billingState, postalCode
// Shows additional fields only after selection (hasSelectedAddress flag)
```

**Environment Configuration:**

```bash
# Desktop (.env)
GOOGLE_PLACES_API_KEY=AIzaSyDHzp2u6H5VnEuVTGAkSC-LiJvr3huUFgY

# Web (pawos-web/.env.local)
NEXT_PUBLIC_GOOGLE_PLACES_API_KEY=AIzaSyDHzp2u6H5VnEuVTGAkSC-LiJvr3huUFgY
```

**Verification:**
- ✅ API key loaded at runtime
- ✅ Suggestions appear when typing
- ✅ Place selection returns structured address
- ✅ All address fields populated
- ✅ Address sent to Razorpay in payment notes

---

### 3. ORGANIZATION TIER MODEL RESTRUCTURING

**Problem:** 
- Organization only supported 'team' and 'enterprise' tiers
- Individual users couldn't create organizations
- Email domain gating prevented legitimate users
- No tier validation or constraints

**Solution Implemented:**

**Database Changes:**
```sql
-- Updated organizations table constraint
ALTER TABLE organizations
  ADD CONSTRAINT organizations_tier_check
  CHECK (tier IN ('go', 'pro', 'proMax', 'team', 'enterprise'));

-- Default tier for new organizations
INSERT INTO organizations (tier, owner_user_id, domain)
VALUES ('go', user_id, email_domain);
```

**Code Changes:**

**File:** `src/shared/organization/OrganizationTypes.ts` (Line 13)
```typescript
// BEFORE
export type OrgTier = 'team' | 'enterprise';

// AFTER
export type OrgTier = 'go' | 'pro' | 'proMax' | 'team' | 'enterprise';
```

**File:** `src/main/billing/OrganizationTierVerification.ts` (Lines 71)
```typescript
// Updated tier validation
if (tier !== 'go' && tier !== 'pro' && tier !== 'proMax' && tier !== 'team' && tier !== 'enterprise') {
  return { ok: false, reason: 'Organization has no recognized tier.' };
}
```

**File:** `src/renderer/organization/OrganizationService.ts`
```typescript
// REMOVED: Email domain validation that blocked non-business emails
// REMOVED: Logic that forced organizations to 'team' tier

// KEPT: RLS policies (users see only their own organizations)
// KEPT: Organization membership verification
```

**Tier Hierarchy:**
```
Individual Accounts:
├── Go (free) - default
├── Pro ($20/month)
└── Pro Max ($100/month)

Organization Accounts:
├── Go (free) - default for new orgs
├── Pro ($20/seat/month)
├── Pro Max ($100/seat/month)
├── Team (₹1,913/seat/month) - max 150 seats
└── Enterprise (custom) - unlimited seats
```

**Result:**
- ✅ All tiers now supported
- ✅ No email domain restrictions
- ✅ Organizations default to 'go' tier
- ✅ Users can create/join organizations of any tier
- ✅ Database constraints enforce valid tiers

---

### 4. TEAM TIER SEAT LIMIT (150 Maximum)

**Problem:** No limit on seats for Team organizations, could cause runaway costs

**Solution Implemented:**

**File:** `src/renderer/ui/billing/TeamCheckoutPage.tsx`

**Step 1: Define Constant (Line 50)**
```typescript
const MAX_TEAM_SEATS = 150;
```

**Step 2: Standard Seat Increment (Lines 521-534)**
```typescript
<button
  onClick={() => {
    if (standardSeatCount + premiumSeatCount < MAX_TEAM_SEATS) {
      setStandardSeatCount(standardSeatCount + 1);
      setErrorMessage('');
    } else {
      setErrorMessage(`Maximum ${MAX_TEAM_SEATS} seats allowed. Contact support for higher seat counts.`);
    }
  }}
  disabled={standardSeatCount + premiumSeatCount >= MAX_TEAM_SEATS}
  style={{
    color: standardSeatCount + premiumSeatCount >= MAX_TEAM_SEATS 
      ? 'rgba(var(--pawos-overlay-rgb), 0.4)' 
      : 'inherit',
    cursor: standardSeatCount + premiumSeatCount >= MAX_TEAM_SEATS 
      ? 'not-allowed' 
      : 'pointer',
  }}
>
  +
</button>
```

**Step 3: Premium Seat Increment (Lines 569-597)**
```typescript
// Same logic as standard seats
// Checks total (standard + premium) against MAX_TEAM_SEATS
```

**Step 4: Seat Count Display (Lines 638-650)**
```typescript
<div style={{ marginBottom: '12px', padding: '10px 12px', borderRadius: '8px', background: 'rgba(var(--pawos-overlay-rgb), 0.05)', fontSize: '12px' }}>
  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
    <span>Total seats:</span>
    <span style={{ fontWeight: 600 }}>{standardSeatCount + premiumSeatCount} / {MAX_TEAM_SEATS}</span>
  </div>
  {standardSeatCount + premiumSeatCount >= MAX_TEAM_SEATS && (
    <div style={{ color: '#ef4444', fontSize: '11px', marginTop: '4px' }}>
      Max capacity reached. Contact support for more seats.
    </div>
  )}
</div>
```

**UX Flow:**
```
< 150 seats → Increment buttons active, no warning
= 150 seats → Buttons disabled, red warning shown
Try to add → Error message: "Maximum 150 seats..."
```

**Result:**
- ✅ Prevents accidental seat overflow
- ✅ Clear user feedback at limit
- ✅ Escalation path to support/enterprise tier
- ✅ Maintains service quality for Team tier

---

### 5. SAVED CARDS UI REDESIGN

**Problem:** "Add new card" button showed when saved cards existed, redundant UI

**Solution Implemented:**

**File:** `src/renderer/ui/billing/TierCheckoutPage.tsx` (Lines 740-777)

**Before:**
```
Has saved cards:
├── [Visa •••• 9845]        [✎]
├── [Mastercard •••• 5432]  [✎]
└── [+ Add new card]  ← REMOVED
```

**After:**
```
Has saved cards:
├── [Visa •••• 9845]        [✎]
└── [Mastercard •••• 5432]  [✎]

No saved cards:
└── [Card form with fields]
```

**Card Badge Styling:**

```typescript
<div style={{
  width: 36,
  height: 24,
  borderRadius: 4,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  fontSize: 10,
  fontWeight: 700,
  color: card.brand.toLowerCase() === 'rupay' ? '#0066CC' : 'white',
  background: card.brand.toLowerCase() === 'visa' ? '#1434CB' :
              card.brand.toLowerCase() === 'mastercard' ? '#EB001B' :
              card.brand.toLowerCase() === 'rupay' ? '#FFFFFF' :
              '#0066CC',
  border: card.brand.toLowerCase() === 'rupay' ? '1px solid #999999' : 'none',
}}>
  {card.brand.toUpperCase().slice(0, 1)}
</div>
```

**Brand Colors:**
| Brand | Background | Text | Border |
|-------|-----------|------|--------|
| Visa | #1434CB | White | None |
| Mastercard | #EB001B | White | None |
| RuPay | #FFFFFF | #0066CC | Gray |

**Result:**
- ✅ Clean, professional appearance
- ✅ No redundant UI elements
- ✅ Clear card identification
- ✅ Dynamic data (no hardcoding)

---

## 🧪 Testing & Verification

### Typecheck Results
```bash
✅ src/renderer/ui/billing/TierCheckoutPage.tsx: PASS
✅ src/renderer/ui/billing/TeamCheckoutPage.tsx: PASS
✅ src/renderer/ui/billing/AddressAutocomplete.tsx: PASS
✅ src/shared/organization/OrganizationTypes.ts: PASS
✅ src/main/billing/OrganizationTierVerification.ts: PASS
✅ src/renderer/organization/OrganizationService.ts: PASS

TOTAL: 0 errors, 0 warnings
```

### Build Results
```bash
✅ Renderer build: SUCCESS (89,882ms)
✅ Main process build: SUCCESS
✅ Preload build: SUCCESS

All bundles generated and optimized.
```

### Runtime Verification

**Razorpay Payment:**
- ✅ Order created: ₹1,913 (191300 paise)
- ✅ createPayment() called with card object
- ✅ Custom Checkout form loaded
- ✅ OTP verification initiated
- ✅ Payment success callback triggered

**Address Autocomplete:**
- ✅ Google Places API loaded
- ✅ Autocomplete suggestions appear
- ✅ Address selection returns structured data
- ✅ All address fields populated
- ✅ Address sent in payment notes

**Organization Model:**
- ✅ Organizations accept all 5 tiers
- ✅ Default tier = 'go'
- ✅ RLS policies enforced
- ✅ Tier validation working
- ✅ Email domain validation removed

**Team Seat Limit:**
- ✅ Increment disabled at 150
- ✅ Error message shown
- ✅ Seat counter displays correctly
- ✅ Warning appears at capacity

**Saved Cards:**
- ✅ "Add new card" hidden when cards exist
- ✅ Card badges styled correctly
- ✅ Edit button functional
- ✅ No hardcoded data

---

## 🚀 Deployment

### Pre-Deployment Checklist
- [ ] All typecheck errors resolved
- [ ] Build completes without warnings
- [ ] Manual testing passed on test tier
- [ ] Payment flow tested with test card
- [ ] Address autocomplete tested
- [ ] Organization creation tested
- [ ] Seat limit tested at boundary

### Deployment Steps

**1. Desktop App Deployment:**
```bash
npm run build
npm run package  # Creates installers
# Push to download server
```

**2. Web Platform Deployment:**
```bash
npm run build
# Deploy to production environment
```

**3. Verification:**
```bash
# Monitor these metrics:
- Payment success rate
- Address autocomplete usage
- Organization creation rate
- Seat limit hits
- Error rates
```

### Rollback Plan
```bash
# If critical issue found:
git revert [commit-hash]
npm run build
npm run deploy

# Notify users of temporary service disruption
```

---

## 🔧 Troubleshooting

### Payment Issues

**Issue:** "Your payment amount is different from your order amount"

**Causes:**
1. Amount sent is in amountInr instead of amountPaise
2. Order created with wrong amount
3. Checkout amount mismatch

**Solution:**
```typescript
// Verify in TierCheckoutPage:
const paymentPayload = {
  amount: checkout.amountPaise,  // Must be paise, not INR
  // ...
}
```

**Issue:** "Server error" on createPayment()

**Causes:**
1. Card object missing
2. Card data malformed
3. Razorpay API key invalid

**Solution:**
```typescript
// Ensure card object present:
if (showCardForm && cardNumber && expiryDate && cvv) {
  paymentPayload.card = {
    number: cardNumber.replace(/\s/g, ''),
    name: fullName,
    expiry_month: expiryDate.split('/')[0],
    expiry_year: expiryDate.split('/')[1],
    cvv: cvv,
  };
}
```

### Address Issues

**Issue:** Google Places API not loading

**Causes:**
1. API key missing from environment
2. API key invalid or revoked
3. Incorrect environment variable name

**Solution:**
```bash
# Desktop (.env)
GOOGLE_PLACES_API_KEY=your_key_here

# Web (pawos-web/.env.local)
NEXT_PUBLIC_GOOGLE_PLACES_API_KEY=your_key_here

# Restart dev server to reload env
```

### Organization Issues

**Issue:** "Organization has no recognized tier"

**Causes:**
1. Invalid tier value in database
2. Check constraint violation
3. Old tier values ('team', 'enterprise' only)

**Solution:**
```sql
-- Check valid tiers
SELECT id, tier FROM organizations WHERE tier NOT IN ('go', 'pro', 'proMax', 'team', 'enterprise');

-- Update if needed
UPDATE organizations SET tier = 'go' WHERE tier IS NULL OR tier = '';
```

### Seat Limit Issues

**Issue:** Seat increment button stuck at 149

**Causes:**
1. One seat already purchased
2. Pending transaction not cleared
3. Browser cache

**Solution:**
```typescript
// Force refresh: Hard reload (Ctrl+Shift+R)
// Or check current seat count matches display
```

---

## ❓ FAQ

### Q: Why not use Razorpay Standard Checkout?
**A:** User requirement: keep PawOS as the single checkout UI. Standard Checkout would replace our UI with Razorpay's modal. Custom Checkout lets us maintain our branded experience while Razorpay handles payment security.

### Q: Why 150 seats for Team tier?
**A:** Balance between:
- Service quality (system stability at this scale)
- UX (prevents accidental runaway costs)
- Business (encourages Enterprise tier upgrade)
- Cost (backend can handle 150 concurrent operations per org)

### Q: What if someone needs >150 seats?
**A:** Direct them to support@pawos.com. Enterprise tier has:
- Custom pricing per seat
- No seat limit
- Dedicated support
- Custom SLA agreements

### Q: Why remove email domain validation?
**A:** Legitimate use cases:
- Gmail users creating team organizations
- Freelancers with personal emails
- Contractor teams
- The tier system itself validates appropriateness (Go tier is free for anyone)

### Q: Is card data stored locally?
**A:** No. Card data:
1. Collected in PawOS UI
2. Passed directly to Razorpay SDK
3. Never logged or stored
4. Razorpay handles all PCI compliance

### Q: Are addresses stored?
**A:** Addresses:
1. Collected via Google Places
2. Sent in Razorpay payment notes (metadata)
3. NOT stored in PawOS backend
4. Available in invoice records from Razorpay

### Q: What if Google Places API goes down?
**A:** AddressAutocomplete gracefully degrades:
1. Suggestions stop appearing
2. Users can still type manually
3. Payment continues normally
4. No blocking error

---

## 📞 Support & Escalation

**For Payment Issues:**
- Check Razorpay dashboard: https://dashboard.razorpay.com
- Check order status in dashboard
- Escalate to: support@pawos.com

**For Address Issues:**
- Verify Google Places API key is valid
- Check Google Cloud Console for quota limits
- Test with a known address (e.g., "123 Main St, San Francisco, CA 94105")

**For Organization Issues:**
- Check database: SELECT * FROM organizations WHERE user_id = ?
- Verify RLS policies in Supabase dashboard
- Test with a fresh organization creation

**For Seat Limit Issues:**
- Hard reload browser (Ctrl+Shift+R)
- Check database: SELECT COUNT(*) FROM organization_members WHERE organization_id = ?
- Clear browser cache

---

## 📚 Related Documentation

- `README.md` - User-facing PawOS overview
- `GOVERNANCE.md` - Architecture decisions and compliance
- Individual code files with inline comments

---

**Version:** 1.0  
**Last Updated:** September 1, 2026  
**Maintained By:** Development Team  
**Next Review:** December 1, 2026
