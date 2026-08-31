# Enterprise Checkout UI — Complete Design Guide

## Overview
6-step enterprise checkout flow with admin panel for inquiry management.

---

## STEP 1: Contact Sales Form

```
┌─────────────────────────────────────────┐
│                                         │
│  Contact Sales — Enterprise Tier        │
│  Get a custom solution for your org     │
│                                         │
│  ┌─────────────────────────────────┐   │
│  │ Full Name *                     │   │
│  │ [John Smith________________]    │   │
│  │                                 │   │
│  │ Email *                         │   │
│  │ [john@company.com_____________] │   │
│  │                                 │   │
│  │ Company *                       │   │
│  │ [Acme Corp__________________]  │   │
│  │                                 │   │
│  │ Phone *                         │   │
│  │ [+1 555 123 4567____________]  │   │
│  │                                 │   │
│  │ Seats Needed (minimum 20) *     │   │
│  │ [50________________________]    │   │
│  │                                 │   │
│  │ Message (optional)              │   │
│  │ [We need enterprise features... │   │
│  │  Our team size is 50 engineers] │   │
│  │                                 │   │
│  │ [Submit Inquiry ▶]              │   │
│  └─────────────────────────────────┘   │
│                                         │
└─────────────────────────────────────────┘
```

### Fields:
- **Full Name** — Text input, required
- **Email** — Email input, required
- **Company** — Text input, required
- **Phone** — Tel input, required
- **Seats Needed** — Number input, min 20, required
- **Message** — Textarea, optional (sales notes)

### Validation:
- ✗ All required fields must be filled
- ✗ Email must be valid format
- ✗ Seats must be ≥ 20

### On Submit:
→ IPC validation → Supabase insert → Step 2

---

## STEP 2: Approval Waiting

```
┌─────────────────────────────────────────┐
│                                         │
│  Inquiry Submitted ✓                    │
│  Thank you! Our sales team will review  │
│  your request within 24 hours.          │
│                                         │
│  ┌─────────────────────────────────┐   │
│  │ Inquiry ID:                     │   │
│  │ inquiry_1697123456_abc123d      │   │
│  │                                 │   │
│  │ We'll contact you at:           │   │
│  │ john@company.com                │   │
│  └─────────────────────────────────┘   │
│                                         │
│  [Continue to Organization Setup ▶]    │
│                                         │
└─────────────────────────────────────────┘
```

### Info Box:
- Inquiry ID (copyable code format)
- Contact email confirmation

### Action:
- Click "Continue" → Step 3

---

## STEP 3: Organization Setup

```
┌─────────────────────────────────────────┐
│                                         │
│  Organization Setup                     │
│  Create your enterprise organization    │
│                                         │
│  ┌─────────────────────────────────┐   │
│  │ Company: Acme Corp              │   │
│  │ Your organization will be       │   │
│  │ created and you'll receive      │   │
│  │ admin access.                   │   │
│  └─────────────────────────────────┘   │
│                                         │
│  [Proceed to Configuration ▶]          │
│                                         │
└─────────────────────────────────────────┘
```

### Info:
- Shows company name from inquiry
- Brief description of what happens next

### Action:
- Click "Proceed" → Step 4

---

## STEP 4: Configure Enterprise Plan ⭐ (ENTER PRICE UI)

```
┌─────────────────────────────────────────┐
│                                         │
│  Configure Enterprise Plan              │
│  Set up seats and spending limits       │
│                                         │
│  ┌─────────────────────────────────┐   │
│  │ Number of Seats (min. 20) *     │   │
│  │ [50________________________]    │   │
│  │ $20/seat/month billed annually  │   │
│  │ upfront                         │   │
│  │                                 │   │
│  │ Per-User Monthly Spending       │   │
│  │ Limit (USD) *                   │   │
│  │ [100.00___________________]    │   │
│  │ Maximum usage charge per team   │   │
│  │ member per month                │   │
│  │                                 │   │
│  │ Starting Usage Balance (USD,    │   │
│  │ min. $400) *                    │   │
│  │ [400.00___________________]    │   │
│  │ Initial prepaid credits for the │   │
│  │ organization                    │   │
│  │                                 │   │
│  │ [Review Pricing ▶]              │   │
│  └─────────────────────────────────┘   │
│                                         │
└─────────────────────────────────────────┘
```

### Field 1: Number of Seats
- **Type:** Number input
- **Range:** min 20 (checked on blur)
- **Help Text:** "$20/seat/month billed annually upfront"
- **Calculation:** seats × $20 × 12 = annual seat cost
- **Example:** 50 seats × $20 × 12 = $12,000/year

### Field 2: Per-User Monthly Spending Limit
- **Type:** Currency input (USD)
- **Range:** min $1.00
- **Help Text:** "Maximum usage charge per team member per month"
- **Purpose:** Cap to prevent overspending
- **Example:** $100 = team member can only use $100/month in credits

### Field 3: Starting Usage Balance
- **Type:** Currency input (USD)
- **Range:** min $400.00
- **Help Text:** "Initial prepaid credits for the organization"
- **Purpose:** Pool of prepaid usage across all team members
- **Example:** $400 = $400 in credits available for entire org to use

### Validation:
- ✗ Seats ≥ 20
- ✗ Per-user limit ≥ $1
- ✗ Starting balance ≥ $400

### On Submit:
→ IPC pricing calculation → Step 5

---

## STEP 5: Review & Pricing

```
┌─────────────────────────────────────────┐
│                                         │
│  Review Your Order                      │
│                                         │
│  ┌─────────────────────────────────┐   │
│  │ 50 Seats × $20/month × 12 month │   │
│  │                      $12,000.00 │   │
│  │                                 │   │
│  │ Starting Usage Balance          │   │
│  │                        $400.00  │   │
│  │ ─────────────────────────────── │   │
│  │ Total Due Today    $12,400.00   │   │
│  │                                 │   │
│  │ Invoice: EXP-1697123456-ABC123  │   │
│  └─────────────────────────────────┘   │
│                                         │
│  [Back]  [Proceed to Payment ▶]        │
│                                         │
└─────────────────────────────────────────┘
```

### Pricing Breakdown:
- **Line 1:** Seats annual cost (calculated)
- **Line 2:** Starting usage balance
- **Divider:** Visual separator
- **Total:** Bold, larger font, primary color

### Invoice Number:
- Unique format: `EXP-{timestamp}-{random}`
- Example: `EXP-1697123456-ABC123`

### Actions:
- **Back** — Return to Step 4 to modify configuration
- **Proceed to Payment** — Move to Step 6

---

## STEP 6: Order Complete

```
┌─────────────────────────────────────────┐
│                                         │
│  ✓ Order Complete!                      │
│  Your enterprise organization is ready  │
│                                         │
│  ┌─────────────────────────────────┐   │
│  │ Invoice: EXP-1697123456-ABC123  │   │
│  │ Total Charged: $12,400.00       │   │
│  │ Your team can now log in and    │   │
│  │ start using PawOS.              │   │
│  └─────────────────────────────────┘   │
│                                         │
│  [Go to Dashboard ▶]                    │
│                                         │
└─────────────────────────────────────────┘
```

### Info:
- Success checkmark
- Invoice number (copyable)
- Total charged amount
- Next steps message

### Action:
- Click "Go to Dashboard" → `/dashboard`

---

## ADMIN PANEL: Enterprise Inquiries

```
┌──────────────────────────────────────────────────────────┐
│                                                          │
│ Enterprise Inquiries                                     │
│                                                          │
│ ┌─────────────────┐  ┌─────────────────────────────┐   │
│ │ 5 Inquiries ↻  │  │ Acme Corp                ✕  │   │
│ │                 │  │                             │   │
│ │ ┌─────────────┐ │  │ Name: John Smith            │   │
│ │ │ Acme Corp   │ │  │ Email: john@company.com     │   │
│ │ │ [APPROVED]  │ │  │ Phone: +1 555 123 4567      │   │
│ │ │ John Smith  │ │  │ Seats: 50                   │   │
│ │ │ 50 seats    │ │  │                             │   │
│ │ │ 8/24/2023   │ │  │ Message:                    │   │
│ │ └─────────────┘ │  │ "We need enterprise        │   │
│ │                 │  │  features with SSO and     │   │
│ │ ┌─────────────┐ │  │  audit logging"             │   │
│ │ │ TechCorp    │ │  │                             │   │
│ │ │ [PENDING]   │ │  │ Status:                     │   │
│ │ │ Jane Doe    │ │  │ [pending] [reviewed]        │   │
│ │ │ 100 seats   │ │  │ [approved] [rejected]       │   │
│ │ │ 8/23/2023   │ │  │                             │   │
│ │ └─────────────┘ │  │ Submitted: 8/24/2023 2:30pm │   │
│ │                 │  │                             │   │
│ └─────────────────┘  └─────────────────────────────┘   │
│                                                          │
└──────────────────────────────────────────────────────────┘
```

### Left Panel: Inquiry List
- Shows all inquiries
- Sorted by most recent first
- Each card shows:
  - Company name
  - Status badge (colored: pending=orange, reviewed=blue, approved=green, rejected=red)
  - Contact name
  - Seats needed
  - Date submitted
- Click to select and view details

### Right Panel: Inquiry Detail
- Shows full inquiry information
- Fields:
  - Name
  - Email
  - Phone
  - Seats Needed
  - Message (larger text area)
  - Status (clickable buttons)
  - Submitted date/time

### Status Colors:
- 🟠 Pending (orange #ff9800)
- 🔵 Reviewed (blue #2196f3)
- 🟢 Approved (green #4caf50)
- 🟣 Converted (purple #673ab7)
- 🔴 Rejected (red #f44336)

### Actions:
- Click status button to update
- Refresh button to reload list
- Close detail to deselect

---

## Visual Theme

### Colors (CSS Variables):
```css
--color-primary       = Primary action color (blue)
--color-primary-hover = Darker primary on hover
--color-primary-alpha = Transparent primary (for selection)
--color-text          = Main text (dark in light mode)
--color-text-secondary = Muted text (gray)
--color-surface       = Card/container background
--color-background    = Page background (lighter)
--color-border        = Divider/border color
```

### Typography:
- **Headings:** 600-700 weight, larger sizes
- **Labels:** 12px, 500-600 weight, uppercase, spaced
- **Body:** 14px, 400 weight, line-height 1.5
- **Help Text:** 12px, secondary color

### Spacing:
- Container padding: 32px
- Field margin: 20px
- Button padding: 12px 24px
- Border radius: 6-8px

### Responsive:
- Max-width: 600px (mobile-friendly)
- Flex layout adapts to screen size
- Admin panel: 300px list + flexible detail

---

## User Flow

```
Contact Form (Step 1)
      ↓
     [Submit inquiry via IPC + Supabase]
      ↓
Waiting for Approval (Step 2)
      ↓
     [Admin reviews in Enterprise Inquiries panel]
     [Admin updates status to "Approved"]
      ↓
Organization Setup (Step 3)
      ↓
     [Org created in background]
      ↓
Configure Plan (Step 4) ⭐ ENTER PRICE UI
      ↓
     [Set seats, per-user limit, starting balance]
     [Pricing calculated: seats*$20*12 + balance]
      ↓
Review Order (Step 5)
      ↓
     [Show total due, invoice number]
      ↓
Order Complete (Step 6)
      ↓
     [Send to Dashboard]
```

---

## Data Flow

```
INQUIRY FORM (Step 1)
  ↓
  .name: "John Smith"
  .email: "john@company.com"
  .company: "Acme Corp"
  .phone: "+1 555 123 4567"
  .seatsNeeded: 50
  .message: "Optional message..."
  ↓
  INSERT INTO enterprise_inquiries
  ↓
  Stored in Supabase with status="pending"

CONFIGURATION (Step 4)
  ↓
  .seatsCount: 50
  .spendingLimitPerUserCents: 10000 (cents = $100)
  .startingBalanceCents: 40000 (cents = $400)
  ↓
  CALCULATE:
  seatsAnnualCost = 50 * $20 * 12 * 100 = 1,200,000 cents
  totalDue = 1,200,000 + 40,000 = 1,240,000 cents ($12,400)
  invoiceNumber = "EXP-1697123456-ABC123"
  ↓
  INSERT INTO enterprise_orders
  ↓
  Stored in Supabase with status="pending", payment_status="unpaid"
```

---

## Status: ✅ COMPLETE

All UI screens designed and implemented:
- ✅ Step 1: Contact form
- ✅ Step 2: Approval waiting
- ✅ Step 3: Organization setup
- ✅ Step 4: Configure plan (ENTER PRICE)
- ✅ Step 5: Review pricing
- ✅ Step 6: Order complete
- ✅ Admin panel: Inquiry management & approval

Ready for **live demo**!
