# PawOS Mobile PWA — Pairing Page Reference Implementation

## Location
In the `pawos-web` repository:
```
apps/pawos-web/src/pages/pair/[sessionId].tsx
```

## Purpose
The `/pair/[sessionId]?token=[token]` page handles the mobile side of the pairing flow:
1. Receives pairing session from QR code
2. Confirms QR scan with backend
3. Shows Security Key input form
4. Verifies Security Key
5. Stores persistent session token
6. Redirects to mobile dashboard

## Implementation Overview

### State Management
```typescript
type PairingState = 
  | 'loading'
  | 'qr_verified'
  | 'key_entry'
  | 'verifying'
  | 'success'
  | 'error';
```

### Step 1: QR Confirmation (On Page Load)
```typescript
// Extract sessionId and token from URL params
const { sessionId, token } = router.query;

// Call: complete_pairing_session(token)
const deviceId = await mobilePairingClient.confirmQRScan(sessionId, token);

// Show green checkmark
setState('qr_verified');
```

### Step 2: Security Key Entry (After QR Success)
Display form:
```html
<input 
  type="text" 
  placeholder="Enter Security Key" 
  value={keyInput}
  onChange={e => setKeyInput(e.target.value.toUpperCase())}
  maxLength={9}
/>
<button onClick={handleKeyVerify}>Verify Connection</button>
```

### Step 3: Key Verification
```typescript
const result = await mobilePairingClient.verifySecurityKey(sessionId, keyPlain);

if (result.success) {
  // Store persistent session
  await mobilePairingClient.storeSessionToken({
    sessionToken: result.sessionToken,
    deviceId: result.deviceId,
    userId: ..., // Extract from auth/token
    expiresAt: result.expiresAt,
    createdAt: new Date().toISOString(),
  });

  // Show success
  setState('success');

  // Redirect to dashboard after 2 seconds
  setTimeout(() => router.push('/dashboard'), 2000);
}
```

### Step 4: Session Validation (On App Reopen)
In a layout or context provider:
```typescript
useEffect(() => {
  const checkSession = async () => {
    const stored = await mobilePairingClient.getStoredSessionToken();
    if (stored) {
      // Validate with backend
      const isValid = await mobilePairingClient.validateSessionToken(stored.sessionToken);
      if (isValid) {
        // Auto-connect: user is already paired
        setIsConnected(true);
      } else {
        // Token expired or revoked
        await mobilePairingClient.deleteStoredSessionToken();
        showMessage('Connection expired, please pair again');
      }
    }
  };

  checkSession();
}, []);
```

## UI States & Screens

### Loading
```
Connecting to PawOS Desktop...
[spinner]
```

### QR Verified
```
✓

Desktop Found

PawOS Desktop

QR pairing complete.
Preparing secure setup...
```

### Key Entry
```
Secure your connection

Enter the Security Key
shown on your PawOS Desktop.

[________ ]

[ Verify Connection ]
```

### Verifying
```
Verifying your connection...
[spinner]
```

### Success
```
✓

You're Connected

PawOS Desktop

Secure connection established.

[ Continue ]
```

### Error
```
Connection Failed

[error message]

[ Try Again ]
```

## Error Messages

User-facing errors (from backend):
- "Security key has already been used"
- "Security key has expired. Request a new one from Desktop."
- "Too many failed attempts. Start a new pairing from Desktop."
- "Security key does not match. Please try again."
- "QR code has expired. Request a new one from Desktop."
- "Invalid QR code. Make sure it's from PawOS Desktop."
- "PawOS Desktop unavailable. Try again in a moment."

## Security Considerations

### Never Do
- Store sessionToken in localStorage
- Store plaintext in URL parameters beyond page load
- Persist plaintext Security Key
- Trust client-side validation (all verification server-side)
- Reuse pairing sessions
- Retry forever on wrong key

### Always Do
- Use IndexedDB for persistent tokens (survives reload, cleared on cache clear)
- Validate all tokens server-side before granting access
- Clear session on user logout
- Handle revocation events from backend
- Respect token expiration
- Use HTTPS only

## Testing Strategy

### Happy Path
1. Desktop generates QR
2. Mobile scans QR → shows green ✓
3. Desktop generates Security Key
4. Mobile enters key → shows ✓ Connected
5. Close mobile
6. Reopen mobile → auto-connects
7. Desktop disconnects → mobile shows "reconnect required"
8. Reconnect with new QR + key

### Error Cases
- Expired QR → "QR expired" error
- Reused QR → "QR already used" error
- Expired key → "Key expired" error
- Wrong key (5 attempts) → "Too many attempts" error
- Network offline → Graceful retry

### Security Tests
- Old session token rejected
- Revoked device rejected
- Cross-account pairing rejected
- QR token cannot be used as persistent credential
- Session token cannot access another user's data
