# PawOS - Your Intelligent AI Coding Assistant

PawOS is a hybrid desktop + cloud application that brings Claude AI directly into your development workflow. It combines the power of Anthropic's Claude models with seamless integration into your local development environment.

---

## 🎯 Why PawOS, Not CLI?

### Desktop-First Architecture

PawOS is **not a CLI tool** by design. Here's why:

**1. Rich User Interface**
- Interactive conversation threads with Claude
- Code inspection and editing within the UI
- File browser and project navigation
- Real-time terminal output and logs
- Syntax highlighting and code preview

**2. Stateful Sessions**
- Maintain conversation context across multiple tasks
- Reference previous solutions and decisions
- Built-in memory of project structure and patterns
- Persistent state without manual context passing

**3. Seamless Integration**
- Direct file editing in the IDE
- Git operations without CLI syntax
- Payment and subscription management (web)
- Organization and team collaboration
- Settings and preferences UI

**4. Better Debugging Experience**
- View error messages in context
- Step through code with visual feedback
- Compare before/after code changes
- Instant preview of terminal output

**5. Desktop + Cloud Hybrid**
- Desktop app runs locally for security and speed
- Web platform for team collaboration
- Synchronized preferences and data
- Works offline with online sync

---

## 📦 PawOS Tiers & How They Work

### 🟢 Go Tier (Free)
**Best for:** Learning, experimentation, small projects

**Features:**
- Full access to Claude AI assistance
- Local desktop application
- 5 supported runtimes: Coding
- Basic file operations
- Manual task execution only

**Billing:**
- Free forever
- No credit card required
- Individual accounts only

**Use Case:**
```
Student learning web development
Independent developer exploring AI coding
Small hobby projects
```

---

### 🔵 Pro Tier ($20/month or $19,053/year)
**Best for:** Professional individual developers

**Features:**
- Everything in Go tier
- Monthly or yearly billing (save 17% annually)
- Autonomous task execution
- Extended conversation history
- Priority support

**Billing:**
- $20 USD / month (₹1,913 INR)
- $100 USD / year (₹19,053 INR)
- Billed to individual account
- Auto-renewal (can be cancelled anytime)

**Individual Dashboard:**
- Subscription status
- Billing history and receipts
- Payment method management
- Usage analytics

**Use Case:**
```
Full-time developer working solo
Freelancer optimizing workflow
Developer supporting multiple small projects
```

---

### 🟣 Pro Max Tier ($100/month)
**Best for:** Power users needing advanced features

**Variants:**
- **5x Usage**: ₹9,565/month - 5x the request limits
- **20x Usage**: ₹23,913/month - 20x the request limits

**Features:**
- Everything in Pro tier
- Significantly higher usage allowances
- Advanced code analysis features
- Extended context window access
- Custom runtime configurations

**Billing:**
- Monthly only (no annual discount)
- Billed to individual account
- Higher usage quotas included

**Use Case:**
```
Data scientist running large experiments
Full-stack developer managing complex systems
AI researcher fine-tuning solutions
```

---

### 🏢 Team Tier (₹1,913 per seat/month)
**Best for:** Small to medium teams (2-150 people)

**Features:**
- All Pro tier features per team member
- **Up to 150 seats maximum**
- Shared organization workspace
- Invite team members by email
- Organization-level settings and billing
- Audit logs of team activity
- Workspace collaboration

**Seat Types:**
- **Standard Seats** (₹1,913/month): Full Coding Runtime access
- **Premium Seats** (₹9,565/month): 5x usage allowances

**Billing:**
- Per-seat model (multiply by number of seats)
- Invoice-based payment for amounts >₹50,000
- Credit card for amounts ≤₹50,000
- Monthly renewal
- Add/remove seats anytime

**How It Works:**
```
1. Create team organization
2. Invite team members via email
3. Manage seats and seat types
4. Monthly billing for total seats
5. Each member has full Pro access
6. Shared workspace for collaboration
```

**Seat Limit:**
- Maximum 150 seats per organization
- Need more? Contact support for Enterprise tier
- Support email: support@pawos.com

**Organization Features:**
- Invite and manage members
- Choose team name and settings
- View organization-wide audit logs
- Manage billing and payment methods
- Role-based permissions (Owner, Admin, Member)

**Use Case:**
```
Startup team of 5-20 developers
Consulting agency with rotating project teams
Small agency offering development services
In-house development team at medium company
```

---

### 🏛️ Enterprise Tier (Custom pricing)
**Best for:** Large organizations with custom needs

**Features:**
- All Team tier features with no seat limit
- Custom rate negotiation
- Dedicated support channel
- SSO and advanced security
- Custom SLA agreements
- On-premise deployment option

**Billing:**
- Custom per-seat rates based on volume
- Annual or multi-year contracts
- Volume discounts available
- Dedicated account manager

**How It Works:**
```
1. Contact sales for custom quote
2. Negotiate pricing based on seat count
3. Custom deployment and configuration
4. Dedicated technical support
5. Regular business reviews and optimization
```

**Requirements:**
- 150+ seats
- Custom compliance needs
- On-premise deployment
- Advanced security requirements

**Use Case:**
```
Fortune 500 company
Large software consulting firm
Enterprise with 500+ developers
Company with strict compliance requirements
```

---

## 🎁 Recent Updates (2026)

### Billing Address Autocomplete
- **What Changed:** Address field now uses Google Places Autocomplete
- **Where:** Team/Enterprise invoice checkout, Pro/Pro Max card checkout
- **Benefit:** Faster checkout, accurate billing addresses, no manual entry
- **How It Works:**
  ```
  1. User starts typing address
  2. Google Places suggestions appear
  3. User selects from dropdown
  4. Full address auto-populated (street, city, state, postal code)
  5. Address validated before payment
  ```

### Team Tier Seat Limit (150 max)
- **What Changed:** Added hard limit of 150 seats per organization
- **Why:** Ensures system stability and performance for team tier
- **Benefit:** Allows large teams while maintaining service quality
- **How It Works:**
  ```
  Seat increment buttons disabled when reaching 150 seats
  Error message: "Max 150 seats. Contact support for higher."
  UI shows current/max: "Total seats: 125 / 150"
  ```

### Saved Cards UI Redesign
- **What Changed:** Clean card badge display with brand logos
- **Supported Cards:** Visa (blue), Mastercard (red), RuPay (white)
- **Benefit:** Professional appearance, quick card identification
- **Format:** `[BRAND] Card Type •••• Last4 digits  [✎ Edit]`

### Structured Address Data
- **What Changed:** Address now captured as structured fields
- **Where:** address1, address2, city, state, postal_code
- **Benefit:** Better address validation, accurate invoicing
- **Use:** Sent to Razorpay for invoice generation

---

## 🛠️ Architecture Overview

### Why Desktop + Web?

**Desktop Application (Electron)**
- ✅ Local file system access (fast, secure)
- ✅ Direct Git integration
- ✅ Real-time terminal output
- ✅ Offline capability
- ✅ Direct IDE interactions
- ✅ System resource management

**Web Platform (Next.js)**
- ✅ Team collaboration features
- ✅ Organization management
- ✅ Payment and billing (PCI-compliant)
- ✅ Team workspace sharing
- ✅ Audit logs and security
- ✅ Device-agnostic access

**How They Work Together:**
```
Desktop App (Local)
├── File System Access
├── Git Operations
├── Terminal Integration
└── Claude AI via HTTPS → PawOS Backend

Web Platform (Cloud)
├── Team Management
├── Billing & Payments
├── Organization Dashboard
└── Shared Workspace

Sync Layer
├── Authentication (Google, GitHub, Email)
├── Subscription Status
├── Organization Membership
└── Settings Sync
```

---

## 🚀 Getting Started

### For Individuals (Pro Tier)
1. Download PawOS Desktop from [pawos.revantaai.com](https://pawos.revantaai.com)
2. Sign in with Google, GitHub, or email
3. Upgrade to Pro tier ($20/month)
4. Start using in your projects

### For Teams (Team Tier)
1. First team member signs up to PawOS
2. Creates organization (free tier initially)
3. Invites team members via email
4. Upgrades to Team tier
5. Selects standard/premium seat types
6. Adds team members and auto-enrolls

### For Enterprise
1. Contact sales@pawos.com
2. Schedule discovery call
3. Negotiate custom pricing
4. Deploy and configure
5. Dedicated support begins

---

## 💳 Payment & Billing

### Payment Methods
- Credit card (Visa, Mastercard, RuPay)
- Bank transfer (for amounts >₹50,000)
- Invoice (automatic for Team/Enterprise)

### Invoice Thresholds
- **≤₹50,000:** Credit card payment only
- **>₹50,000:** Invoice-based payment required
- **Team Tier:** Includes billing address capture
- **Enterprise:** Custom payment terms

### Security
- PCI DSS Level 1 compliant
- Razorpay for payment processing
- No card data stored locally
- TLS encryption for all transactions

---

## 📊 Why Choose PawOS?

| Feature | PawOS | CLI Tool | IDE Plugin |
|---------|-------|----------|-----------|
| Rich UI | ✅ | ❌ | Limited |
| Offline Mode | ✅ | ✅ | ❌ |
| Team Collaboration | ✅ | ❌ | ❌ |
| Billing/Subscriptions | ✅ | ❌ | Limited |
| Stateful Conversations | ✅ | Awkward | Limited |
| File Browsing | ✅ | ❌ | ✅ |
| Git Integration | ✅ | ✅ | Limited |
| Terminal Output | ✅ | ✅ | Limited |
| Organization Management | ✅ | ❌ | ❌ |
| Audit Logs | ✅ | ❌ | ❌ |

---

## 🔐 Security & Privacy

- Local files stay local (desktop app)
- End-to-end encrypted team communications
- Organization-level access controls
- Audit logs for compliance
- GDPR and SOC 2 compliant infrastructure

---

## 📞 Support

**For Issues:**
- Email: support@pawos.com
- In-app help widget
- Documentation: [pawos.revantaai.com/docs](https://pawos.revantaai.com/docs)

**For Enterprise:**
- Dedicated account manager
- Custom SLA agreements
- 24/7 priority support

---

## 📄 License

PawOS is proprietary software. See LICENSE file for details.

---

**Ready to get started? Visit [pawos.revantaai.com](https://pawos.revantaai.com) today.**
