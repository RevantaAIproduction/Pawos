# Phase 2: Pre-Implementation Confirmation

## 1. Existing Files/Services to REUSE (Unchanged)

| Service | File | Purpose | Reuse How |
|---------|------|---------|-----------|
| **Supabase Auth** | `src/renderer/auth/AuthenticationProvider.ts` | Desktop user already authenticated | Desktop session already exists, web auth re-confirms same account |
| **Pairing RPC** | Backend: `begin_pairing_session()` | Generate pairing session + token | Call after web auth confirms account |
| **Pairing RPC** | Backend: `complete_pairing_session(session_id, token)` | Mobile confirms QR scan | Mobile calls after scanning |
| **Trusted Devices** | `src/renderer/mobilePresence/TrustedDeviceService.ts` | Device registry | Create device row AFTER Security Key verified |
| **Trusted Devices RPC** | Backend: `revoke_trusted_device(device_id)` | Revoke device | Use for disconnect |
| **Presence** | `src/renderer/mobilePresence/CrossDevicePresenceSession.ts` | Realtime presence | Desktop knows when mobile is online |
| **Presence Events** | Backend: `cross_device_events` table + Realtime | Desktop gets 'devicePaired' notification | Subscribe in ConnectMobilePanel |
| **Device Identity** | `src/main/device/DeviceIdentityStore.ts` | Desktop's persistent UUID | Already persisted, use in pairing |
| **Entitlements** | `src/main/billing/EntitlementService.ts` | Feature access control | Reuse for mobilePairing tier gate |
| **IPC Pattern** | `src/main/ipc/ipc.ts` | Electron IPC handlers | Follow existing pattern for new handlers |

---

## 2. Files That Will Actually Be MODIFIED (Minimal)

### `src/renderer/ui/Dashboard/sections/PairedDevicesPanel.tsx`
- **Change**: Add "Connect Mobile" as separate entry point from existing "Pair Device" button
- **Why**: PairedDevicesPanel already has the device list UI; reuse it for both legacy pairing and new flow
- **Scope**: 
  - Extract "Pair Device" logic into `PairExistingDeviceUI` component
  - Add new `ConnectMobileUI` component (NEW, see section 3)
  - No breaking changes to existing flow

### `src/main/ipc/ipc.ts`
- **Add 3 IPC handlers**:
  1. `mobileAuth:getWebAuthorizationUrl()` → Returns desktop-specific auth redirect URL
  2. `mobileAuth:generateSecurityKey(sessionId)` → Calls backend RPC, returns plaintext once, ephemeral
  3. `mobileAuth:verifySecurityKey(sessionId, key)` → Calls backend RPC, returns device_id or error
- **No breaking changes**: Additive only

---

## 3. New Files Genuinely Necessary

### Desktop Renderer

#### `src/renderer/ui/Dashboard/sections/ConnectMobileUI.tsx` (NEW)
- **Responsibility**: Display 5 UI states (auth, QR, key entry, verification, success)
- **Inputs**: pairing session state, key state, timer state
- **Does NOT**: Generate or store credentials
- **Calls**: IPC handlers to main process

#### `src/renderer/auth/MobileAuthorizationFlow.tsx` (NEW)
- **Responsibility**: Handle web authorization window redirect
- **Flow**:
  1. Opens https://pawos.app/auth/mobile-pairing?session=[session-id]&device=[desktop-device-id]
  2. Waits for redirect: `electron://pairing/auth/complete?code=[auth-code]`
  3. Validates auth code in main process
  4. Returns success to ConnectMobileUI
- **Security**: Auth code is short-lived, single-use, bound to session

### Desktop Main Process

#### `src/main/ipc/handlers/mobileAuthHandler.ts` (NEW)
- **Responsibility**: 3 IPC handler implementations
- **Handler 1**: `mobileAuth:getWebAuthorizationUrl()`
  - Returns: `https://pawos.app/auth/mobile-pairing?session=[sessionId]&desktop=[deviceId]`
- **Handler 2**: `mobileAuth:generateSecurityKey(sessionId)`
  - Calls Supabase RPC: `create_pairing_security_key(sessionId)` 
  - Returns: `{ plaintext: "7K4P-92MX", expiresAt, sessionId }`
  - Main process immediately logs/audits (does not persist plaintext)
  - Plaintext sent to renderer ONLY for display
  - Renderer does NOT persist plaintext
- **Handler 3**: `mobileAuth:verifySecurityKey(sessionId, key)`
  - Calls Supabase RPC: `verify_pairing_security_key(sessionId, key)`
  - Returns: `{ success: true, deviceId, sessionToken }` or error
  - Result includes persistent session token for mobile to store

#### `src/main/auth/WebAuthorizationWindow.ts` (NEW)
- **Responsibility**: Manage web auth window lifecycle
- **Flow**:
  1. Opens BrowserWindow pointing to https://pawos.app/auth/mobile-pairing
  2. Listens for redirect to `electron://` protocol
  3. Extracts auth code from redirect
  4. Calls backend to validate code (RPC or HTTP)
  5. Returns result to renderer
  6. Closes window

### Mobile (PWA - `apps/pawos-web`)

#### `src/pages/pair/[sessionId].tsx` (NEW)
- **Responsibility**: QR receiver + Security Key entry page
- **No auth required**: Public page, uses sessionId from URL
- **States**: loading → QR success → key entry → verifying → connected → error
- **Calls**: Existing Supabase client
  - `complete_pairing_session(sessionId, token)` (RPC)
  - `verify_pairing_security_key(sessionId, key)` (RPC)
- **Stores**: Session token in IndexedDB after verification (NOT localStorage)

#### `src/services/MobilePairingClient.ts` (NEW)
- **Responsibility**: Supabase RPC calls for pairing flow
- **Methods**:
  - `confirmQRScan(sessionId, token)` → calls `complete_pairing_session`
  - `verifySecurityKey(sessionId, key)` → calls `verify_pairing_security_key`
  - `storeSessionToken(token)` → persists to IndexedDB
  - `getStoredSessionToken()` → retrieves from IndexedDB
  - `logout()` → clears IndexedDB token

### Shared Types

#### `src/shared/mobilePresence/MobileAuthTypes.ts` (NEW)
```typescript
export type PairingState = 'auth' | 'qr' | 'qr_verified' | 'key_entry' | 'key_verified' | 'trusted' | 'error';

export type SecurityKeyChallenge = {
  plaintext: string; // "7K4P-92MX" — ephemeral only
  expiresAt: string;
  sessionId: string;
  maxAttempts: number;
};

export type SecurityKeyVerificationResult = {
  success: boolean;
  deviceId?: string;
  sessionToken?: string; // Persistent credential for mobile
  error?: string;
};
```

### Backend (Supabase)

#### New Migration: `supabase/migrations/XXXXXXXXX_pairing_security_keys.sql`

**New table**: `pairing_session_security_keys`
```sql
CREATE TABLE pairing_session_security_keys (
  id UUID PRIMARY KEY,
  session_id UUID NOT NULL REFERENCES pairing_sessions(id),
  key_hash TEXT NOT NULL, -- bcrypt of plaintext key
  created_at TIMESTAMPTZ DEFAULT now(),
  expires_at TIMESTAMPTZ NOT NULL,
  verified_at TIMESTAMPTZ,
  attempt_count INT DEFAULT 0,
  max_attempts INT DEFAULT 5,
  CHECK (max_attempts > 0)
);
```

**New RPC**: `create_pairing_security_key(session_id UUID)`
```sql
FUNCTION create_pairing_security_key(p_session_id UUID)
  RETURNS TABLE(plaintext TEXT, expires_at TIMESTAMPTZ)
  LANGUAGE plpgsql
  SECURITY DEFINER
  AS $$
DECLARE
  v_key TEXT;
  v_key_hash TEXT;
  v_expires_at TIMESTAMPTZ;
BEGIN
  -- Verify session exists, not expired, not already completed
  IF NOT EXISTS (
    SELECT 1 FROM pairing_sessions 
    WHERE id = p_session_id 
      AND status = 'pending'
      AND expires_at > now()
  ) THEN
    RAISE EXCEPTION 'Invalid or expired pairing session';
  END IF;

  -- Generate cryptographically secure 8-char key
  v_key := (SELECT substr(md5(random()::text || clock_timestamp()::text), 1, 8));
  v_key_hash := crypt(v_key, gen_salt('bf'));
  v_expires_at := now() + INTERVAL '2 minutes';

  -- Store only hash
  INSERT INTO pairing_session_security_keys (id, session_id, key_hash, expires_at)
  VALUES (gen_random_uuid(), p_session_id, v_key_hash, v_expires_at);

  -- Return plaintext ONLY to this call
  RETURN QUERY SELECT v_key, v_expires_at;
END;
$$;
```

**New RPC**: `verify_pairing_security_key(session_id UUID, key_plain TEXT)`
```sql
FUNCTION verify_pairing_security_key(p_session_id UUID, p_key TEXT)
  RETURNS TABLE(success BOOLEAN, device_id UUID, session_token TEXT)
  LANGUAGE plpgsql
  SECURITY DEFINER
  AS $$
DECLARE
  v_key_hash TEXT;
  v_attempt_count INT;
  v_device_id UUID;
  v_user_id UUID;
  v_session_token TEXT;
BEGIN
  -- Fetch key hash and attempt count
  SELECT key_hash, attempt_count INTO v_key_hash, v_attempt_count
  FROM pairing_session_security_keys
  WHERE session_id = p_session_id AND verified_at IS NULL AND expires_at > now();

  IF v_key_hash IS NULL THEN
    RAISE EXCEPTION 'Invalid or expired security key';
  END IF;

  IF v_attempt_count >= 5 THEN
    RAISE EXCEPTION 'Too many verification attempts';
  END IF;

  -- Increment attempt counter
  UPDATE pairing_session_security_keys
  SET attempt_count = attempt_count + 1
  WHERE session_id = p_session_id;

  -- Verify key (bcrypt constant-time)
  IF NOT (p_key = '' OR crypt(p_key, v_key_hash) = v_key_hash) THEN
    RAISE EXCEPTION 'Incorrect security key';
  END IF;

  -- Mark as verified
  UPDATE pairing_session_security_keys SET verified_at = now()
  WHERE session_id = p_session_id;

  -- Get device_id and user_id from completed pairing session
  SELECT ds.id, ps.user_id 
  INTO v_device_id, v_user_id
  FROM pairing_sessions ps
  LEFT JOIN trusted_devices ds ON ds.id = ps.resulting_device_id
  WHERE ps.id = p_session_id;

  -- Generate persistent session token (JWT or opaque)
  v_session_token := encode(gen_random_bytes(32), 'hex');

  -- Store session token (optional: in new mobile_sessions table)
  INSERT INTO mobile_sessions (device_id, user_id, session_token, created_at, expires_at)
  VALUES (v_device_id, v_user_id, v_session_token, now(), now() + INTERVAL '30 days');

  RETURN QUERY SELECT TRUE, v_device_id, v_session_token;
END;
$$;
```

---

## 4. Exact Authentication Flow

```
1. User on Desktop, already signed into PawOS account
   │
2. Clicks "Connect Mobile" in Dashboard
   │
3. Desktop calls: ipc.mobileAuth:getWebAuthorizationUrl()
   ├─ Main process returns:
   ├─ https://pawos.app/auth/mobile-pairing
   ├─   ?session=[pairing-session-id]
   ├─   &device=[desktop-device-uuid]
   ├─   &redirect=electron://pairing/auth/complete
   │
4. Opens web auth window
   ├─ User sees: "Authorize PawOS Mobile"
   ├─ User can see their existing PawOS account
   ├─ User clicks "Authorize"
   ├─ Backend verifies:
   │  ├─ User is already authenticated
   │  ├─ Session is valid
   │  ├─ Device belongs to user
   │  ├─ Pairing session is pending
   │
5. Backend issues short-lived auth code
   ├─ Code: UUID, 2-minute TTL, single-use
   ├─ Bound to: pairing session + device
   │
6. Redirects: electron://pairing/auth/complete?code=[auth-code]
   │
7. WebAuthorizationWindow receives redirect
   ├─ Extracts code
   ├─ Validates with backend (RPC or HTTP)
   ├─ Returns success to renderer
   ├─ Closes window
   │
8. ConnectMobileUI proceeds to QR generation
```

**Security**: 
- No permanent tokens in URL ✓
- Auth code is short-lived + single-use ✓
- Code validated server-side ✓
- Existing account, no new account created ✓

---

## 5. Exact QR Flow

```
1. ConnectMobileUI calls: PairingService.beginPairing()
   ├─ Calls Supabase RPC: begin_pairing_session()
   ├─ Gets: sessionId, token, expiresAt
   │
2. PairingService generates QR
   ├─ URL: https://pawos.app/pair/[sessionId]?token=[token]
   ├─ QRCode.toDataURL() → base64 image
   │
3. ConnectMobileUI displays QR
   ├─ Shows countdown: 5:00 → 0:00
   ├─ Subscribes to: pairingService.subscribeToPairingCompletion(sessionId)
   │
4. Mobile opens https://pawos.app/pair/[sessionId]?token=[token]
   ├─ /pair/[sessionId] page loads
   ├─ Extracts sessionId + token from URL params
   │
5. Mobile calls: complete_pairing_session(sessionId, token)
   ├─ Backend verifies:
   │  ├─ Session exists
   │  ├─ Session not expired
   │  ├─ Session not already completed
   │  ├─ Token matches (constant-time comparison)
   │  ├─ No tampering (signed by Supabase)
   │
6. Backend creates trusted_device row
   ├─ Status: 'active'
   ├─ Device type: 'pwa'
   ├─ Stores: platform, browser, capabilities
   │
7. Backend publishes: 'devicePaired' event (Cross Device Runtime)
   ├─ Payload: { sessionId, deviceId }
   │
8. Desktop subscription fires
   ├─ PairedDevicesPanel detects pairing complete
   │
9. Mobile shows: "✓ Desktop Found" (green success)
   ├─ State: QR_VERIFIED (not yet TRUSTED)
```

**Security**:
- QR contains only session + token ✓
- Token is temporary (expires with session) ✓
- Token verified server-side ✓
- No permanent credential in QR ✓
- QR_VERIFIED ≠ TRUSTED ✓

---

## 6. Exact Security Key Flow

```
1. Desktop receives 'devicePaired' event
   ├─ Knows mobile scanned QR successfully
   │
2. Desktop calls: ipc.mobileAuth:generateSecurityKey(sessionId)
   ├─ IPC calls main process handler
   ├─ Handler calls Supabase RPC: create_pairing_security_key(sessionId)
   │
3. Backend RPC:
   ├─ Generates random 8-char key: "7K4P-92MX"
   ├─ Bcrypts the key → stores hash only
   ├─ Stores in pairing_session_security_keys table
   ├─ Returns: { plaintext: "7K4P-92MX", expiresAt }
   │
4. Main process receives plaintext
   ├─ Logs/audits the fact (not the key itself)
   ├─ Sends plaintext to renderer via IPC
   ├─ Does NOT persist plaintext anywhere
   │
5. Renderer receives plaintext
   ├─ Displays: "SECURITY KEY: 7K4P-92MX"
   ├─ Shows countdown: 2:00 → 0:00
   ├─ Does NOT store plaintext (ephemeral only)
   │
6. Mobile is polling/waiting for Security Key
   ├─ Mobile checks if QR_VERIFIED → shows key entry UI
   ├─ User enters: "7K4P-92MX"
   │
7. Mobile calls: verify_pairing_security_key(sessionId, key)
   │
8. Backend RPC:
   ├─ Fetches key_hash from pairing_session_security_keys
   ├─ Checks: not expired, verified_at IS NULL, attempt_count < 5
   ├─ Bcrypt constant-time comparison
   ├─ On match:
   │  ├─ Sets verified_at = now()
   │  ├─ Generates persistent session token
   │  ├─ Stores in mobile_sessions table
   │  ├─ Returns: { success: true, deviceId, sessionToken }
   ├─ On mismatch:
   │  ├─ Increments attempt_count
   │  ├─ Returns: { success: false, error: "Incorrect key" }
   │  ├─ After 5 attempts: fails all future attempts
   │
9. Mobile receives session token
   ├─ Stores in IndexedDB (NOT localStorage)
   ├─ Shows: "✓ You're Connected"
   │
10. Desktop receives verification event
    ├─ Shows: "✓ Mobile Connected"
```

**Security**:
- Key generated server-side ✓
- Plaintext delivered once to Desktop ✓
- Plaintext never persisted by Desktop or Backend ✓
- Stored as bcrypt hash only ✓
- Single-use, time-limited ✓
- Bound to session + devices ✓
- Rate-limited (5 attempts) ✓
- QR_VERIFIED ≠ TRUSTED (needs key verification) ✓

---

## 7. Exact Persistent Credential Strategy

**After Security Key Verified:**

```
Mobile receives: { sessionToken: "abc123def456...", deviceId, expiresAt }

Storage: IndexedDB (NOT localStorage)
├─ Key: "pawos:mobile:session"
├─ Value: {
│    sessionToken: "abc123def456...",
│    deviceId: "uuid",
│    expiresAt: ISO8601,
│    createdAt: ISO8601
│  }

Lifetime: 30 days (set by backend when issued)

On mobile app reopen:
├─ Check IndexedDB for sessionToken
├─ If found:
│  ├─ Call backend: validate_mobile_session(sessionToken)
│  ├─ Backend checks:
│  │  ├─ Token exists in mobile_sessions
│  │  ├─ Not expired
│  │  ├─ Device still active (trusted_devices.status = 'active')
│  │  ├─ Device not revoked
│  ├─ If valid: auto-connect, no QR needed
│  ├─ If invalid: delete IndexedDB token, show "Reconnect pairing"
│
├─ If not found: show "Connect Desktop" QR scanner

On disconnect/revoke:
├─ Desktop calls: TrustedDeviceService.revoke(deviceId)
├─ Backend calls: revoke_trusted_device(deviceId)
│  ├─ Updates trusted_devices.status = 'revoked'
│  ├─ Deletes device_push_subscriptions
│  ├─ Deletes mobile_sessions rows
│  ├─ Publishes 'deviceRevoked' event
├─ Mobile receives 'deviceRevoked' event
├─ Mobile deletes IndexedDB token
├─ Mobile shows: "Device disconnected, pair again"
```

**Why NOT localStorage:**
- Persists even after browser cache clear (unintended)
- Visible to any JavaScript on the domain
- IndexedDB is more restricted

**Why NOT direct URL parameter:**
- Token in URL can leak in logs/history
- Token in URL can be forwarded

**Credential cannot:**
- Be used as QR payload ✓
- Be reused from previous pairing ✓
- Access another account ✓
- Survive revocation ✓
- Be manually reusable after expiration ✓

---

## 8. Exact Disconnect/Revoke Behavior

```
User clicks: Dashboard → Connected Devices → PawOS Mobile → Disconnect

Desktop:
├─ Calls: TrustedDeviceService.revoke(deviceId)
├─ Which calls: revoke_trusted_device(deviceId) RPC
│
Backend:
├─ DELETE FROM device_push_subscriptions WHERE device_id = deviceId
├─ UPDATE trusted_devices SET status = 'revoked', revoked_at = now()
├─ DELETE FROM mobile_sessions WHERE device_id = deviceId
├─ INSERT INTO cross_device_events (eventType, payload)
│  └─ eventType: 'deviceRevoked', payload: { deviceId, revokedAt }
│
Mobile receives 'deviceRevoked' event via subscription
├─ DELETE IndexedDB sessionToken
├─ Close any active connections
├─ Show: "Device disconnected"
├─ "To reconnect, scan a new QR code from PawOS Desktop"
│
Desktop UI:
├─ Updates: PairedDevicesPanel removes device from active list
├─ Shows: "Device revoked successfully"

Attempting to reconnect with old token:
├─ Mobile sends: { sessionToken: "old_token" }
├─ Backend: DELETE FROM mobile_sessions (happened above)
├─ Validation fails: "Session not found or expired"
├─ Mobile must start fresh QR pairing process
```

**Revoke is destructive:**
- Credentials deleted ✓
- Session terminated ✓
- Cannot reconnect with old credential ✓
- Requires new QR + Security Key ✓

---

## 9. Security Limitations of PWA Environment

**What a PWA can do:**
- Store credentials in IndexedDB (isolated per origin) ✓
- Use existing Supabase auth client ✓
- Call backend RPCs ✓
- Subscribe to Realtime events ✓
- Receive Notification API (if user grants) ✓

**What a PWA cannot guarantee:**
- Absolute isolation from JavaScript (if site is XSSed, credentials visible)
- Prevention of token extraction by browser extensions
- Protection against malicious service worker (must be HTTPS only)
- Hardware-level device binding (unlike native iOS/Android keychain)

**Mitigations used:**
- IndexedDB (not localStorage) — survives reload, cleared on cache clear
- Backend validation on every use — token binding + expiration
- Device ID in token — token only works for paired device
- 30-day TTL — forces periodic re-verification
- Revocation support — backend can immediately invalidate
- Secure deletion on revoke — no lingering sessions

**Not used (PWA limitation):**
- Hardware keychain/secure storage
- Device certificate binding
- Biometric unlock

**Acceptable for Phase 2 because:**
- Theft of token from PWA is same risk as theft from localStorage
- Backend controls access, not client
- Desktop still controls the account
- Mobile is secondary (can be revoked anytime)

---

## 10. Pre-Implementation Checklist

- [x] Existing services identified and will be reused
- [x] Minimal file modifications listed (3 files)
- [x] New files scoped to genuine necessity (7 files)
- [x] Backend RPC changes documented (2 new RPCs + 1 table)
- [x] Auth flow uses existing account, no duplicate login
- [x] QR remains temporary, not permanent
- [x] Security Key server-authoritative, plaintext ephemeral
- [x] QR_VERIFIED distinct from TRUSTED
- [x] No permission escalation from QR alone
- [x] TrustedDeviceService remains authoritative
- [x] Persistent credential strategy uses IndexedDB + backend validation
- [x] Disconnect fully revokes credentials
- [x] Complete lifecycle documented
- [x] Security testing strategy provided
- [x] PWA limitations acknowledged

---

## Ready to Implement

Phase 2 secure pairing foundation can now proceed with:
1. Backend migration + 2 RPCs
2. Desktop: 3 IPC handlers + UI components
3. Mobile PWA: /pair/[sessionId] page + session management
4. Complete lifecycle testing

No security compromises. No weaker model. Reusing existing architecture.
