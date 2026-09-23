# PawOS Governance System - Complete Verification Test

## Test Setup
Launch the app and follow each test sequentially. After each test, verify the result.

---

## Test 1: Command Execution with Approval
**Prompt:** `check node version`

**Expected Flow:**
1. ✓ Agent starts checking node version
2. ✓ Governance panel appears showing: `Running command: node -v`
3. ✓ Input placeholder changes to: "Type 'allow' to proceed or 'deny' to skip..."
4. ✓ User types: `allow`
5. ✓ Command executes and shows node version in output

**Verify:** Command output appears in chat

---

## Test 2: File Write with Approval
**Prompt:** `write hello.js with console.log('Hello PawOS')`

**Expected Flow:**
1. ✓ Agent prepares to write file
2. ✓ Governance panel shows: `Writing file: /path/to/hello.js`
3. ✓ User types: `allow`
4. ✓ File is created
5. ✓ Message confirms: "I've created hello.js"

**Verify:** File actually exists on disk after approval

---

## Test 3: Deny/Cancel Action
**Prompt:** `delete test.txt`

**Expected Flow:**
1. ✓ Governance panel shows: `Deleting: /path/to/test.txt`
2. ✓ User types: `deny`
3. ✓ Action is cancelled
4. ✓ Message shows: "Action cancelled" or similar

**Verify:** File is NOT deleted (action was denied)

---

## Test 4: Voice Input (Say "Allow")
**Prompt:** `run python --version`

**Expected Flow:**
1. ✓ Governance panel appears: `Running command: python --version`
2. ✓ User SAYS (voice): "allow"
3. ✓ Command executes with voice approval

**Verify:** Command runs after speaking "allow"

---

## Test 5: Voice Input (Say "Deny")
**Prompt:** `update npm`

**Expected Flow:**
1. ✓ Governance panel appears
2. ✓ User SAYS (voice): "deny"
3. ✓ Action is cancelled

**Verify:** Action is denied by voice command

---

## Test 6: Database Connection Approval
**Prompt:** `connect to PostgreSQL localhost 5432 mydb`

**Expected Flow:**
1. ✓ Governance panel shows connection details
2. ✓ User types: `allow`
3. ✓ Connection is established

**Verify:** Database connection confirmed

---

## Test 7: Plan Proposal Approval
**Prompt:** `propose a plan to refactor authentication`

**Expected Flow:**
1. ✓ Agent proposes plan
2. ✓ Governance panel appears if approval needed
3. ✓ Shows plan details
4. ✓ User can approve or deny

**Verify:** Plan is either approved or cancelled based on input

---

## Test 8: Multiple Approvals in Sequence
**Prompt:** `write three files: a.js, b.js, c.js`

**Expected Flow:**
1. ✓ First approval needed → type "allow"
2. ✓ Second approval needed → type "allow"
3. ✓ Third approval needed → type "allow"
4. ✓ All three files created

**Verify:** All three files exist after approvals

---

## Test 9: Input Placeholder Changes
**Verify:**
- Without approval pending: "Describe a task or ask a question..."
- With approval pending: "Type 'allow' to proceed or 'deny' to skip..."
- After approval: Back to normal placeholder

---

## Test 10: Command Details Display
**Verify these show actual commands, not generic text:**
- `node -v` (not "run C:/")
- `npm install` (not "run C:/")
- `/full/path/to/file.js` (not "write file")
- `mysql://localhost:3306/db` (not "connect database")

---

## Summary Checklist

After running all tests, verify:
- [ ] Test 1: Command approval works
- [ ] Test 2: File write creates actual file
- [ ] Test 3: Deny action prevents execution
- [ ] Test 4: Voice "allow" works
- [ ] Test 5: Voice "deny" works
- [ ] Test 6: Database connection approval works
- [ ] Test 7: Plan proposals work
- [ ] Test 8: Multiple sequential approvals work
- [ ] Test 9: Input placeholder changes dynamically
- [ ] Test 10: Command details display correctly

**All 10 tests passing = Governance system is fully functional! ✓**

---

## If Any Test Fails

1. Note which test failed
2. Screenshot the error
3. Check the console (F12) for error messages
4. Share the details for debugging
