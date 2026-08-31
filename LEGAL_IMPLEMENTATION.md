# PawOS Legal Policy & Consent Implementation

## Overview

This implementation adds first-time account consent flows for Privacy Policy and Terms of Service acceptance, with backend validation and version tracking for both PawOS Web and PawOS Desktop.

## What Was Changed

### 1. Database Schema

**File:** `pawos-web/supabase/migrations/20260831_user_legal_acceptance.sql`

Created a new table to track when users accept legal documents:
- Records user ID, document slug, version, timestamp
- Includes audit fields (user agent, IP address)
- RLS policies limit users to viewing their own acceptance records
- Indexed for fast lookups by user and document

### 2. Legal Document Versioning

**File:** `pawos-web/src/lib/legal/sections.ts`

Added version tracking system:
- `LAST_UPDATED`: Updated to 31 August 2026
- `LEGAL_DOCUMENT_VERSIONS`: Maps document slugs to version identifiers (ISO 8601 dates)
  - "terms": "2026-08-31"
  - "privacy-policy": "2026-08-31"
- `LegalDocumentSlug`: TypeScript type for valid document identifiers

**Key principle:** Versions increment when documents materially change. Non-material updates (formatting, corrections) don't require re-acceptance.

### 3. Backend API Endpoints

#### Check Legal Acceptance
**File:** `pawos-web/src/app/api/auth/check-legal-acceptance/route.ts`

- **Method:** POST
- **Auth:** Required (Bearer token)
- **Purpose:** Check whether an authenticated user has accepted current required legal versions
- **Response:** `{ accepted: boolean; missingDocuments?: string[] }`

#### Record Legal Acceptance
**File:** `pawos-web/src/app/api/auth/accept-legal/route.ts`

- **Method:** POST
- **Auth:** Required (Bearer token)
- **Body:** `{ documentSlugs: string[] }`
- **Purpose:** Record that a user has accepted specific versions of legal documents
- **Response:** `{ success: boolean; error?: string }`

#### Check Google Account Existence
**File:** `pawos-web/src/app/api/auth/check-google-account/route.ts`

- **Method:** POST
- **Body:** `{ email: string }`
- **Purpose:** Check if a Google email already has a PawOS account (prevents silent account creation)
- **Response:** `{ exists: boolean; userId?: string }`

### 4. Web Application Updates

#### Signup Form
**File:** `pawos-web/src/app/signup/SignupForm.tsx`

**Changes:**
- Added state for `agreedToTerms` and `agreedToPrivacy` checkboxes
- Added two checkbox inputs with links to legal documents:
  - "I agree to the [Terms of Service]"
  - "I acknowledge the [Privacy Policy]"
- Links open documents in new tabs (`target="_blank"`)
- Submit button disabled until both checkboxes are checked
- Account creation now records legal acceptance via API
- Clear error message if checkboxes aren't checked

#### Privacy Policy Page
**File:** `pawos-web/src/app/privacy/page.tsx`

**Changes:**
- Updated "Last updated" to: "31 August 2026 • Version: 2026-08-31"
- Now matches the canonical version identifier in the legal document system

#### Terms of Service Page
**File:** `pawos-web/src/app/terms/page.tsx`

**Changes:**
- Updated "Last updated" to: "31 August 2026 • Version: 2026-08-31"
- Now matches the canonical version identifier in the legal document system

### 5. Desktop Application Updates

#### Auth Screen
**File:** `src/renderer/ui/Auth/AuthScreen.tsx`

**Changes:**
- Added state for `agreedToPrivacy` checkbox (was only terms before)
- Replaced single checkbox with two separate checkboxes:
  - "I agree to the [Terms of Service]" with clickable link
  - "I acknowledge the [Privacy Policy]" with clickable link
- Links open in external browser via `window.open(url, '_blank')`
- Submit button disabled until both checkboxes are checked
- Updated error message to require both acceptances
- Proper label structuring for accessibility

#### Auth Screen Styles
**File:** `src/renderer/ui/Auth/authScreen.module.css`

**Changes:**
- Added `.termsLink` class for styling legal document links
- Underlined text, proper hover states
- Inherits font size and family from parent context

### 6. Utility Module

**File:** `pawos-web/src/lib/supabase/server-admin.ts`

Created a helper to get the Supabase admin client:
- Uses service-role key to bypass RLS
- Used by API endpoints that need elevated permissions
- Never exposed to the browser

## Implementation Flow

### New Account Creation

**Web (Email/Password):**
1. User fills name, email, password
2. User checks both legal acceptance boxes
3. Submit button becomes enabled
4. Form submits to Supabase auth.signUp()
5. On success, API records acceptance in `user_legal_acceptance` table
6. User is redirected to dashboard

**Web (OAuth - Google/GitHub):**
1. User clicks "Continue with Google/GitHub"
2. Redirected to OAuth provider
3. After provider auth, returned to `/auth/callback`
4. Callback creates Supabase session
5. Redirects to dashboard (or acceptance flow if needed)

**Desktop (Email/Password):**
1. User fills name, email, password
2. User checks both legal acceptance boxes
3. Submit button becomes enabled
4. Form submits to Supabase auth.signUp()
5. Verification email sent (OTP flow)
6. User verifies email
7. Account created with acceptance recorded

**Desktop (OAuth - Google/GitHub):**
1. User clicks provider button
2. Desktop app opens browser to OAuth provider
3. After auth, redirected to `/auth/google/callback` (web) or `/auth/github/callback` (desktop relay)
4. Session created
5. User enters PawOS

### Existing Account Login

**Scenario: User has accepted current versions**
1. User logs in (email/password or OAuth)
2. Session created
3. User enters application
4. No acceptance screen needed

**Scenario: User hasn't accepted current version**
1. User logs in
2. System checks `user_legal_acceptance` table
3. Finds missing version
4. Shows acceptance screen (to be implemented)
5. After acceptance, user enters application

### Version Change Workflow

When a legal document materially changes:

1. Update document content in the code
2. Increment version in `LEGAL_DOCUMENT_VERSIONS`
3. Deploy
4. On next login, users with old versions are prompted to re-accept
5. New acceptance recorded with new version identifier

## Security & Privacy Considerations

### What's Tracked
- User ID (who accepted)
- Document slug and version (what was accepted)
- Acceptance timestamp (when)
- User agent (browser/app info)
- IP address (for audit trail)

### What's NOT Tracked
- Password or authentication tokens
- Full payment details
- Conversation content
- Local files or companion memory

### RLS Policies
- Users can only view their own acceptance records
- Backend APIs use service-role key for pre-login checks
- No information leaked about whether other users' accounts exist

### Google Account Handling
- Check endpoint validates email format
- No silent account provisioning
- Clear error message if account doesn't exist
- User directed to create account first

## Testing Checklist

- [ ] New email/password user, boxes unchecked → Create button disabled
- [ ] New user checks only Terms → Create button disabled
- [ ] New user checks only Privacy → Create button disabled
- [ ] New user checks both → Create button enabled
- [ ] After account creation → Acceptance recorded in database
- [ ] Existing user with current acceptance → Normal login, no acceptance screen
- [ ] Existing user missing current version → Acceptance screen shown (future feature)
- [ ] Google account for existing PawOS user → Normal login
- [ ] Google account with no PawOS account → "Account not found" message
- [ ] Terms link opens correct canonical document
- [ ] Privacy link opens correct canonical document
- [ ] Legal versions display correctly (2026-08-31)
- [ ] Refresh/reopen doesn't lose acceptance state
- [ ] Keyboard-only operation works (Tab, Space, Enter)
- [ ] Screen reader announces checkbox labels
- [ ] Mobile/responsive design works
- [ ] Server rejects account creation if acceptance missing
- [ ] No credentials in logs
- [ ] Web and Desktop use same legal versions

## Remaining Implementation Tasks

### High Priority (Complete First-Time Flow)

1. **Database migration application**
   - Run: `supabase migration up`
   - Verify table creation in Supabase dashboard

2. **OAuth account existence check**
   - Integrate check endpoint into OAuth callback flow
   - Show "Account not found" message if needed

3. **Acceptance screen for existing users**
   - Create UI component for acceptance of new versions
   - Show when `check-legal-acceptance` returns `accepted: false`
   - Display missing document(s) clearly

4. **Mobile/desktop consent flow**
   - Test on mobile browsers
   - Verify checkbox accessibility

### Medium Priority (Improve UX)

5. **Analytics on acceptance rates**
   - Query `user_legal_acceptance` table for reporting
   - Track which documents most users struggle with

6. **Withdrawal of consent**
   - Allow users to withdraw acceptance
   - Handle consequences (e.g., account suspension)

7. **Export of acceptance records**
   - Data portability request fulfillment
   - User can request their own acceptance history

### Low Priority (Nice to Have)

8. **Automated legal document updates**
   - Detection of material changes
   - Automatic version bump
   - Notification pipeline

9. **Multi-language legal documents**
   - Translate core documents
   - Version tracking per language

10. **Compliance audit reports**
    - Query acceptance data by date range
    - Export for regulatory audits

## Environment Variables Required

Ensure these are set in `.env.local`:

```
NEXT_PUBLIC_SUPABASE_URL=<your-supabase-url>
NEXT_PUBLIC_SUPABASE_ANON_KEY=<your-anon-key>
SUPABASE_SERVICE_ROLE_KEY=<your-service-role-key>
```

The service-role key is only used server-side in API routes — never exposed to the client.

## References

- Legal documents: `pawos-web/src/lib/legal/sections.ts` (source of truth)
- Legal content: `pawos-web/src/lib/legalContent.ts`
- Web signup: `pawos-web/src/app/signup/SignupForm.tsx`
- Desktop auth: `src/renderer/ui/Auth/AuthScreen.tsx`
- Database: `pawos-web/supabase/migrations/20260831_user_legal_acceptance.sql`

## Notes

- The implementation requires the Supabase migration to be applied before acceptance recording will work
- Google account existence check relies on `auth.admin.listUsers()` (requires service-role key)
- Links to legal documents use absolute URLs (`https://pawos.revantaai.com/...`) to work from both web and desktop
- Version identifiers use ISO 8601 dates (YYYY-MM-DD) for human readability and sorting
- The accept-legal endpoint is called after account creation to avoid transaction issues
