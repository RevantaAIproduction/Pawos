# Phase 2 End-to-End Testing Guide

## Prerequisites

1. **Supabase Migration Applied**
   ```bash
   # In pawos Electron/server environment
   supabase migration up 20260731000000
   ```

2. **Verify Backend RPC Exists**
   ```sql
   -- In Supabase SQL editor
   SELECT * FROM pg_proc WHERE proname = 'create_pairing_security_key';
   SELECT * FROM pg_proc WHERE proname = 'verify_pairing_security_key';
   ```

3. **Verify Tables Exist**
   ```sql
   SELECT * FROM information_schema.tables 
   WHERE table_name IN ('mobile_sessions', 'pairing_session_security_keys');
   ```

4. **Desktop App Running**
   - PawOS Desktop (Electron) built and running
   - User already logged in
   - Dashboard accessible

---

## Test 1: Happy Path (Complete Pairing Flow)

### Step 1.1: Desktop QR Generation
```
Location: Dashboard → Settings → Connected Devices (or similar)
Action: Click "Connect Mobile"
Expected:
  ✓ "Authorize your PawOS account" message appears
  ✓ Web authorization window opens (or modal)
  ✓ No errors in browser console
```

### Step 1.2: Web Authorization
```
Action: Complete web auth (sign in with existing account)
Expected:
  ✓ Redirect back to Desktop app
  ✓ UI progresses to "QR" state
  ✓ QR code displays (valid image)
  ✓ Countdown timer shows "Expires in 04:59"
```

**Verify QR Content:**
```javascript
// In browser console while QR is displayed
// QR should decode to: https://pawos.app/pair/[sessionId]?token=[token]
// Both sessionId and token should be present
```

### Step 1.3: Mobile QR Scan (Simulated)
```
Action: On Desktop, before QR expires:
  Open another browser tab
  Navigate to: https://pawos.app/pair/[sessionId]?token=[token]
    (extract sessionId and token from QR data URL via JavaScript)

Expected on Desktop:
  ✓ Countdown resets or stops
  ✓ UI progresses to "key" state
  ✓ Security Key displayed: "7K4P-92MX" format (8 chars)
  ✓ Key countdown shows "Expires in 01:59"

Expected on Mobile (browser tab):
  ✓ Page shows: "✓ Desktop Found"
  ✓ Green checkmark appears
  ✓ After 1-2 seconds, transitions to "Secure your connection"
  ✓ Input field for Security Key visible
```

### Step 1.4: Mobile Security Key Entry
```
Action: On Mobile tab, enter the Security Key from Desktop
  Copy exact value: 7K4P-92MX
  Paste into input field
  Click "Verify Connection"

Expected on Desktop:
  ✓ UI transitions to "verification" state
  ✓ Spinner shows "Verifying your connection..."

Expected on Mobile:
  ✓ UI transitions to "verifying" state
  ✓ Spinner shows "Verifying..."

After ~1-2 seconds:
  Desktop:
    ✓ UI shows "✓ Mobile Connected" success
  Mobile:
    ✓ UI shows "✓ You're Connected"
    ✓ "Continue" button visible
    ✓ Device is now paired
```

### Step 1.5: Verify Database State
```sql
-- In Supabase SQL editor, logged in as the test user
SELECT COUNT(*) FROM trusted_devices WHERE status = 'active';
  Expected: ≥ 1 (new device)

SELECT COUNT(*) FROM mobile_sessions WHERE revoked_at IS NULL;
  Expected: 1 (one active session)

SELECT session_token, expires_at FROM mobile_sessions 
  WHERE revoked_at IS NULL LIMIT 1;
  Expected:
    - session_token: 64-char hex string
    - expires_at: ~30 days from now

SELECT verified_at FROM pairing_session_security_keys 
  WHERE session_id = '[pairing-session-id]';
  Expected: verified_at IS NOT NULL (timestamp)
```

### Test 1 Result
```
✓ PASS if all steps complete without error
✗ FAIL if any step blocks or shows unexpected error
```

---

## Test 2: QR Expiration

### Step 2.1: Desktop Generate QR
```
Action: Click "Connect Mobile" again
Wait: Let the QR expire (5 minutes)
```

### Step 2.2: Attempt Scan After Expiry
```
Action: Try to scan the expired QR
  GET https://pawos.app/pair/[sessionId]?token=[token]

Expected:
  Mobile page shows error:
    "QR code has expired. Generate a new one from PawOS Desktop."
  
  No device is created
  No session token is issued
```

### Step 2.3: Desktop UI
```
Expected:
  Desktop UI shows timer expiry
  "QR expired" message or similar
  "Generate new QR" button visible
```

### Test 2 Result
```
✓ PASS if expiration is enforced
✗ FAIL if expired QR still accepts scan or creates device
```

---

## Test 3: Security Key Expiration

### Step 3.1: Desktop QR → Key
```
Action: Complete pairing up to Security Key display
Result: Security Key shown with 2-minute countdown
```

### Step 3.2: Wait for Key Expiration
```
Wait: Let key expire (2 minutes, OR set system clock +2min)
Action: Try to enter the key
```

### Step 3.3: Verify Rejection
```
Expected on Mobile:
  Error message: "Security key has expired. Request a new one from PawOS Desktop."
  
No device is created
No session token is issued
```

### Test 3 Result
```
✓ PASS if expired key is rejected
✗ FAIL if expired key still verifies
```

---

## Test 4: Wrong Security Key (Rate Limiting)

### Step 4.1: Desktop QR → Key
```
Action: Complete pairing up to Security Key display
```

### Step 4.2: Enter Wrong Key 5 Times
```
Action: On Mobile, enter incorrect values:
  1. ABC-DEFGH (wrong)
  2. XXXX-XXXX (wrong)
  3. 1234-5678 (wrong)
  4. ZZZZ-ZZZZ (wrong)
  5. YYYY-YYYY (wrong)

Expected after attempt 1-4:
  Error: "Security key does not match. Please try again."
  Input field clears
  Key still not expired
  Can retry

Expected after attempt 5:
  Error: "Too many failed attempts. Start a new pairing from Desktop."
  Input field disabled
  Pairing session marked failed
```

### Step 4.3: Desktop State
```
Expected:
  Desktop UI shows: "Verification failed"
  Or key expires (cannot retry)
  Button to start new pairing visible
```

### Test 4 Result
```
✓ PASS if rate limiting works after 5 attempts
✗ FAIL if unlimited retries allowed
```

---

## Test 5: Reused QR Prevention

### Step 5.1: Desktop QR → Mobile Scan
```
Action: Complete QR pairing successfully
  Mobile: QR scan succeeds, shows green ✓
  Desktop: Generates Security Key
```

### Step 5.2: Try to Reuse QR
```
Action: Try to scan the same QR again in a new browser tab
  GET https://pawos.app/pair/[sessionId]?token=[token] (same token)

Expected:
  Error: "This QR code has already been used." or similar
  
  Existing pairing is NOT affected
  No second device is created
  No second session token is issued
```

### Step 5.3: Verify Database
```sql
SELECT COUNT(*) FROM trusted_devices WHERE status = 'active';
  Expected: 1 (only one device, not two)

SELECT COUNT(*) FROM mobile_sessions WHERE revoked_at IS NULL;
  Expected: 1 (only one session)
```

### Test 5 Result
```
✓ PASS if QR reuse is rejected
✗ FAIL if QR can be used twice
```

---

## Test 6: Persistence & Reconnection

### Step 6.1: Pair Device
```
Action: Complete entire pairing flow successfully
Result: Mobile shows "You're Connected"
```

### Step 6.2: Close Mobile Browser Tab
```
Action: Close the mobile browser tab
Wait: 5 seconds
Action: Reopen a new tab
Navigate to: https://pawos.app/dashboard (or similar)

Expected on Mobile:
  ✓ Auto-login (no manual auth needed)
  ✓ Dashboard loads
  ✓ Device is recognized as paired
  ✓ No "Pair Device" prompt shown
```

### Step 6.3: Verify Backend
```sql
-- While mobile is online and connected
SELECT last_seen_at FROM trusted_devices WHERE id = '[device-id]';
  Expected: last_seen_at is RECENT (last few seconds)

SELECT last_used_at FROM mobile_sessions WHERE revoked_at IS NULL;
  Expected: last_used_at is RECENT (heartbeat working)
```

### Step 6.4: Close & Reopen Desktop
```
Action: Close PawOS Desktop app
Wait: 30 seconds
Action: Reopen Desktop app
Action: Go to Connected Devices

Expected:
  ✓ Mobile device still shows in "Paired devices" list
  ✓ Status shows "Online" or recent "Last active"
```

### Test 6 Result
```
✓ PASS if reconnection works without re-pairing
✗ FAIL if device requires re-pairing or manual session restoration
```

---

## Test 7: Disconnect/Revoke

### Step 7.1: Paired Device Exists
```
State: Mobile device is currently paired and connected
```

### Step 7.2: Desktop Disconnect
```
Action: Dashboard → Connected Devices → [Mobile Device] → Disconnect
Expected:
  ✓ Confirmation dialog
  ✓ After clicking "Confirm": UI shows success
  ✓ Device removed from "Paired devices" list
```

### Step 7.3: Verify Backend
```sql
SELECT status, revoked_at FROM trusted_devices WHERE id = '[device-id]';
  Expected: status = 'revoked', revoked_at = NOW()

SELECT revoked_at FROM mobile_sessions WHERE device_id = '[device-id]';
  Expected: revoked_at IS NOT NULL (session invalidated)
```

### Step 7.4: Mobile Discovers Disconnection
```
State: Mobile tab still open from before disconnect

Action: Try to navigate to protected page or wait for sync
Expected:
  ✓ Mobile detects revocation (via event or polling)
  ✓ Shows: "Device disconnected. Pair again from Desktop."
  ✓ Session token is cleared from IndexedDB
  ✓ Logout occurs or re-pairing required
```

### Step 7.5: Attempt Reconnection with Old Token
```
Action: Manually try to reconnect with old session token
  (Simulate: AJAX call with old session_token to backend)

Expected:
  Backend returns: "Session not found or expired"
  Mobile cannot reconnect
  Must start new QR pairing
```

### Step 7.6: New QR Required
```
Action: Click "Connect Desktop" on Mobile
Result:
  ✓ QR scanner shown
  ✓ Desktop generates new QR (old QR is gone)
  ✓ Scan new QR → complete new pairing flow
  ✓ New device record created (or same device re-paired)
```

### Test 7 Result
```
✓ PASS if revocation works and forces re-pairing
✗ FAIL if old session token still works or revocation incomplete
```

---

## Test 8: Cross-Account Prevention

### Step 8.1: User A Pairs Device
```
State: Account A (user@example.com) has paired mobile device
```

### Step 8.2: User A Logs Out
```
Action: Desktop app → Logout
Action: Supabase auth → logout current session
```

### Step 8.3: User B Logs In
```
Action: Desktop app → Sign In
Input: Account B credentials (different user@example2.com)
Result: Desktop now authenticated as Account B
```

### Step 8.4: Try to Use Old Session
```
State: Mobile still has session token from Account A
Action: Mobile calls backend with old session_token

Expected:
  Backend verifies:
    - user_id from token (Account A)
    - current auth user (Account B)
    - Mismatch!
  
  Backend rejects:
    Error: "Session not found or expired" (don't leak which account)
  
  Mobile cannot access Account B's data
  Mobile must re-pair to Account B
```

### Step 8.5: Re-Pair to Account B
```
Action: On Desktop (Account B): Click "Connect Mobile"
Action: Mobile: Scan new QR
Expected:
  ✓ Pairing succeeds
  ✓ New session created for Account B
  ✓ Old session still revoked
  ✓ Device is now trusted for Account B
```

### Test 8 Result
```
✓ PASS if cross-account access is prevented
✗ FAIL if session can be reused across accounts
```

---

## Test 9: Error Recovery

### Step 9.1: Cancel During QR
```
State: Desktop showing QR, waiting for mobile
Action: Click "Cancel" button
Expected:
  ✓ Pairing session cancelled (server-side)
  ✓ QR is now invalid
  ✓ UI returns to initial "Connect Mobile" button
  ✓ Try scanning cancelled QR → Error "QR invalid"
```

### Step 9.2: Cancel During Key Entry
```
State: Desktop showing Security Key, mobile showing key entry
Action: Desktop: Click "Cancel"
  OR Mobile: Click "Cancel" (if button exists)
Expected:
  ✓ Pairing session cancelled
  ✓ Security Key invalidated
  ✓ Both show initial screens
  ✓ Must start new QR pairing
```

### Step 9.3: Network Offline
```
State: Mobile device is connected, attempting to verify key
Action: Disconnect network on mobile
  Key entry: Click "Verify Connection"
Expected on Mobile:
  ✓ Network error message
  ✓ "Retry" button available
  ✓ Message: "Network unavailable, please try again"
  ✓ Key countdown still visible (don't lose data)

Action: Reconnect network
Expected:
  ✓ "Retry" button works
  ✓ Key can be re-submitted
  ✓ Verification succeeds
```

### Test 9 Result
```
✓ PASS if all error states show helpful messages and recovery works
✗ FAIL if errors are cryptic or recovery isn't possible
```

---

## Test 10: Security Key Plaintext Non-Persistence

### Step 10.1: Generate Security Key
```
State: Desktop showing Security Key: "7K4P-92MX"
```

### Step 10.2: Verify Plaintext Not in Logs
```
Action: Desktop developer console → Application storage
Check:
  ✗ localStorage should NOT contain "7K4P-92MX"
  ✗ sessionStorage should NOT contain "7K4P-92MX"
  ✗ IndexedDB should NOT contain "7K4P-92MX"
  
Expected:
  Plaintext key is only in React component state (ephemeral)
```

### Step 10.3: Verify Plaintext Not in Backend
```sql
-- In Supabase SQL
SELECT key_hash FROM pairing_session_security_keys;
  Expected: Values are bcrypt hashes, NOT plaintext
  
SELECT * FROM pairing_sessions;
  Expected: No plaintext keys stored

SELECT * FROM audit_logs WHERE action = 'create_security_key';
  Expected: Logs the FACT, not the key value
```

### Step 10.4: Refresh Page & Check Memory
```
Action: On Desktop, page refresh
Expected:
  ✓ Security Key is gone (not persisted)
  ✓ UI resets or shows error
  ✓ Cannot retrieve key from console (not stored anywhere)
```

### Test 10 Result
```
✓ PASS if plaintext is truly ephemeral
✗ FAIL if plaintext is found in any storage
```

---

## Summary of Test Results

| Test | Status | Notes |
|------|--------|-------|
| 1. Happy Path | ✓/✗ | Complete pairing flow |
| 2. QR Expiration | ✓/✗ | Expired QR rejected |
| 3. Key Expiration | ✓/✗ | Expired key rejected |
| 4. Rate Limiting | ✓/✗ | 5 attempts limit |
| 5. QR Reuse Prevention | ✓/✗ | Single-use token |
| 6. Persistence | ✓/✗ | Reconnect without rescanning |
| 7. Disconnect/Revoke | ✓/✗ | Credential invalidation |
| 8. Cross-Account | ✓/✗ | Session isolation |
| 9. Error Recovery | ✓/✗ | Graceful error handling |
| 10. Plaintext Security | ✓/✗ | No persistence |

---

## Test Execution Checklist

Before running tests:
- [ ] Supabase migrations applied
- [ ] Backend RPCs exist and functional
- [ ] Desktop app built and running
- [ ] User logged in to Desktop
- [ ] Network connectivity confirmed
- [ ] Database access for verification

During tests:
- [ ] Monitor browser console for errors
- [ ] Watch Supabase logs for RPC calls
- [ ] Check desktop app logs for IPC errors
- [ ] Verify database state after each test

After all tests:
- [ ] Generate test report
- [ ] Document any failures
- [ ] File issues for failed tests
- [ ] Mark Phase 2 as complete/blocked
