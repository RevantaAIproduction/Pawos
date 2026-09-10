# JIRA OAUTH WRITE-BACK FIX DESIGN AUDIT
**Date:** 2026-09-08  
**Method:** READ-ONLY source code tracing  
**Scope:** Smallest safe fix for existing Jira OAuth write-back feature

---

## CURRENT STATE

### OAuth Connection Path (WORKING ✓)
- **JiraConnectorSDK.connect()** (line 92-130)
  - Performs OAuth 2.0 exchange via OAuthManager
  - Stores accessToken in credentialVaultBridge (line 102-106)
  - Stores metadata (cloudId, siteUrl) in jiraMetadataStore (line 109-114)
  - Registers JiraConnector with `mode: 'bearer'` + accessToken (line 78)

### JiraConnector Bearer Support (WORKING ✓)
- **JiraConnector.ts** (line 30-59)
  - Constructor accepts `{ mode: 'bearer'; accessToken: string }` (line 36)
  - Private `headers()` method: Bearer auth support exists (line 54-55)
  ```typescript
  if (this.credential?.mode === 'bearer') {
    return { Authorization: `Bearer ${this.credential.accessToken}`, Accept: 'application/json' };
  }
  ```
  - Used by: getTicket(), searchTickets(), listMyTickets()
  - Basic auth still supported for legacy (line 57-58)

### Write-Back Path (BROKEN ✗)
- **AutonomousOrchestrator.ts** (line 1200, 1214)
  - Calls: `ipcRenderer.invoke('connectivity:postJiraComment', {...})`
  - Passes: `jiraUrl, apiEmail, apiToken, issueKey, comment`

- **CredentialResolver.ts** (line 41-54)
  - Fetches OAuth token from credentialVaultBridge
  - Fetches metadata from jiraMetadataStore
  - **FABRICATES** placeholder `email: 'api@jira'` (line 50)
  - **MISNAMES** OAuth token as `apiToken` (line 51)

- **JiraWriteBackPlugin.ts** (line 31-73)
  - postJiraComment(): hardcoded Basic auth (line 33-38)
  - transitionJiraIssue(): hardcoded Basic auth (line 86-91)
  - Expects: `{ jiraUrl, apiEmail, apiToken, issueKey, comment }`
  - **INCOMPATIBLE with OAuth** — will construct invalid Basic auth header

---

## ROOT CAUSE ANALYSIS

| Component | Purpose | Current Implementation | Problem |
|-----------|---------|------------------------|---------|
| OAuth Connection | Store credentials | JiraConnectorSDK | ✓ Works — stores Bearer token |
| Credential Storage | Keep token safe | credentialVaultBridge | ✓ Works — stores accessToken |
| Credential Resolution | Provide to write-back | CredentialResolver | ✗ Fabricates invalid combo |
| Bearer Auth Support | HTTP headers | JiraConnector | ✓ Works — Bearer already implemented |
| Write-Back Functions | Comment + transition | JiraWriteBackPlugin | ✗ Only supports Basic auth |

**The gap:** OAuth token stored and kept safe, but write-back layer doesn't know how to use Bearer auth.

---

## FIX OPTIONS

### OPTION A: Add Bearer Auth to JiraWriteBackPlugin

**Approach:**
Update `postJiraComment()` and `transitionJiraIssue()` to detect and handle Bearer tokens.

**Changes required:**

1. **JiraWriteBackPlugin.ts** — Update both functions:
   ```typescript
   // Before (line 33):
   const auth = Buffer.from(`${input.apiEmail}:${input.apiToken}`).toString("base64");
   headers: { Authorization: `Basic ${auth}` }
   
   // After:
   const headers: Record<string, string> = {};
   if (input.apiEmail === 'api@jira') {
     // Bearer token (OAuth)
     headers.Authorization = `Bearer ${input.apiToken}`;
   } else {
     // Basic auth (legacy)
     const auth = Buffer.from(`${input.apiEmail}:${input.apiToken}`).toString("base64");
     headers.Authorization = `Basic ${auth}`;
   }
   ```

2. **JiraCommentInput type** (line 6-12) — No change (still accepts apiEmail/apiToken)

3. **CredentialResolver.ts** (line 48-52) — No change (still returns normalized shape)

**Files changed:**
- `src/main/execution/plugins/infrastructure/JiraWriteBackPlugin.ts` (2 functions)

**Runtime path:**
```
AutonomousOrchestrator
  → CredentialResolver (returns placeholder email + OAuth token)
  → postJiraComment/transitionJiraIssue (detects placeholder, uses Bearer)
  → Jira API (receives Bearer auth)
```

**Pros:**
- Minimal code change
- Backward compatible with legacy Basic auth
- Doesn't touch credential resolution or storage
- No IPC/preload changes needed
- No database migrations
- No test infrastructure changes
- Idempotency/reconciliation unchanged

**Cons:**
- Placeholder email 'api@jira' becomes a magic value throughout code
- Two different auth modes detected by magic string
- Less clean architecture
- Future maintainers may not understand why 'api@jira' is special

**Credential storage change:** NO
**IPC/preload change:** NO
**Comment path affected:** YES (fixed)
**Transition path affected:** YES (fixed)
**Basic-auth preserved:** YES
**Idempotency preserved:** YES
**Live test required:** YES

---

### OPTION B: Reuse JiraConnector Bearer-Auth Implementation

**Approach:**
Extract JiraConnector's Bearer auth logic into a shared helper, reuse in write-back.

**Changes required:**

1. **Create shared Jira auth helper** — New file `src/main/infrastructure/connectors/projectManagement/JiraAuthHelper.ts`:
   ```typescript
   export type JiraAuthCredential = ... // Move from JiraConnector.ts
   export function jiraHeaders(credential: JiraAuthCredential, baseUrl?: string): Record<string, string> {
     // Extract from JiraConnector.headers()
   }
   ```

2. **JiraConnector.ts** — Use helper:
   ```typescript
   private headers(): Record<string, string> {
     return jiraHeaders(this.credential);
   }
   ```

3. **JiraWriteBackPlugin.ts** — Use helper:
   ```typescript
   const credential: JiraAuthCredential = input.isBearerToken 
     ? { mode: 'bearer', accessToken: input.apiToken }
     : { mode: 'basic', email: input.apiEmail, apiToken: input.apiToken };
   const headers = jiraHeaders(credential);
   ```

4. **CredentialResolver.ts** (line 48-52) — Return explicit flag:
   ```typescript
   result.jira = {
     url: ...,
     email: credentials.jira.email,
     apiToken: credentials.jira.apiToken,
     isBearerToken: true, // Add explicit flag
   };
   ```

**Files changed:**
- `src/main/infrastructure/connectors/projectManagement/JiraAuthHelper.ts` (NEW)
- `src/main/infrastructure/connectors/projectManagement/JiraConnector.ts` (refactor headers())
- `src/main/execution/plugins/infrastructure/JiraWriteBackPlugin.ts` (use helper)
- `src/renderer/organization/CredentialResolver.ts` (add isBearerToken flag)

**Runtime path:**
```
AutonomousOrchestrator
  → CredentialResolver (returns isBearerToken flag)
  → postJiraComment/transitionJiraIssue (uses JiraAuthHelper)
  → jiraHeaders() (constructs correct auth)
  → Jira API
```

**Pros:**
- Shared auth logic (single source of truth)
- Explicit flag instead of magic string
- Cleaner architecture
- Easier to extend in future
- Clear intent (isBearerToken)
- JiraConnector refactored but behavior unchanged

**Cons:**
- More files changed
- CredentialResolver object shape changes
- All callers of CredentialResolver might reference isBearerToken
- More moving parts = more regression risk

**Credential storage change:** NO
**IPC/preload change:** NO
**Comment path affected:** YES (fixed)
**Transition path affected:** YES (fixed)
**Basic-auth preserved:** YES
**Idempotency preserved:** YES
**Live test required:** YES

---

### OPTION C: Extend JiraConnector with Write-Back Methods

**Approach:**
Add postComment() and transitionIssue() methods directly to JiraConnector (which already has Bearer auth support).

**Changes required:**

1. **JiraConnector.ts** — Add new methods:
   ```typescript
   async postComment(issueKey: string, comment: string): Promise<ConnectorResult<{ commentId: string }>> {
     // Move logic from postJiraComment
     const res = await fetch(`${this.baseUrl}/rest/api/3/issue/${issueKey}/comments`, {
       method: 'POST',
       headers: { ...this.headers(), 'Content-Type': 'application/json' },
       body: JSON.stringify({ body: { type: 'doc', version: 1, content: [...] } }),
     });
     // ...
   }
   
   async transitionIssue(issueKey: string, transitionName: string): Promise<ConnectorResult<{}>> {
     // Move logic from transitionJiraIssue
   }
   ```

2. **CredentialResolver.ts** — Return connector instance:
   ```typescript
   // Instead of returning raw credentials
   const connector = new JiraConnector(
     `https://api.atlassian.com/ex/jira/${jiraMetaResult.data.cloudId}`,
     { mode: 'bearer', accessToken: jiraResult.data.secret }
   );
   result.jira = connector;
   ```

3. **JiraWriteBackPlugin.ts** — Becomes thin wrapper:
   ```typescript
   export async function postJiraComment(input: JiraCommentInput) {
     const connector = input as JiraConnector; // Simplified
     return connector.postComment(input.issueKey, input.comment);
   }
   ```

4. **AutonomousOrchestrator.ts** — Use connector directly:
   ```typescript
   const result = await credentials.jira.postComment(input.ticketId, jiraComment);
   ```

**Files changed:**
- `src/main/infrastructure/connectors/projectManagement/JiraConnector.ts` (+postComment, +transitionIssue)
- `src/renderer/organization/CredentialResolver.ts` (return connector instance)
- `src/main/execution/plugins/infrastructure/JiraWriteBackPlugin.ts` (simplify)
- `src/renderer/organization/AutonomousOrchestrator.ts` (direct connector calls)
- `src/main/ipc/connectivityIpc.ts` (IPC handlers adapt)

**Runtime path:**
```
AutonomousOrchestrator
  → CredentialResolver (returns JiraConnector instance)
  → JiraConnector.postComment() (uses existing Bearer auth)
  → Jira API
```

**Pros:**
- Single source of truth (JiraConnector)
- Natural inheritance — read methods + write methods on same class
- No auth magic — same Bearer logic everywhere
- CredentialResolver returns usable object

**Cons:**
- JiraConnector interface changes (adds write methods)
- CredentialResolver returns union type (read vs write context)
- Type confusion — is JiraConnector a read-only view or full connector?
- AutonomousOrchestrator couples directly to infrastructure connector
- Harder to test write-back in isolation
- May create confusion: JiraConnector used for both read (InvestigateTicket) and write (autonomous work)

**Credential storage change:** NO
**IPC/preload change:** YES (IPC handlers need refactoring)
**Comment path affected:** YES (fixed)
**Transition path affected:** YES (fixed)
**Basic-auth preserved:** UNCLEAR (JiraConnector still supports it, but not exposed via CredentialResolver)
**Idempotency preserved:** YES (wrappable)
**Live test required:** YES

---

### OPTION D: Keep Basic-Auth Support, Add OAuth Path

**Approach:**
Preserve JiraWriteBackPlugin as-is, support BOTH basic auth AND OAuth paths separately.

**Changes required:**

1. **JiraWriteBackPlugin.ts** — Add OAuth variant:
   ```typescript
   export async function postJiraCommentWithOAuth(
     cloudId: string,
     accessToken: string,
     issueKey: string,
     comment: string
   ): Promise<JiraWriteBackResult> {
     const headers = { Authorization: `Bearer ${accessToken}`, ... };
     // Same fetch logic as postJiraComment
   }
   ```

2. **JiraWriteBackIdempotent.ts** — Call OAuth variant:
   ```typescript
   // Check credential type
   if (input.isBearerToken) {
     result = await postJiraCommentWithOAuth(input.cloudId, input.apiToken, ...);
   } else {
     result = await postJiraComment(input as JiraCommentInput);
   }
   ```

3. **CredentialResolver.ts** — Return indicator:
   ```typescript
   result.jira = {
     url: ...,
     email: credentials.jira.email,
     apiToken: credentials.jira.apiToken,
     cloudId: jiraMetaResult.data.cloudId,
     isBearerToken: true,
   };
   ```

4. **AutonomousOrchestrator.ts** — Pass through:
   ```typescript
   const result = await ipcRenderer.invoke('connectivity:postJiraComment', {
     ...credentials.jira,
     issueKey: input.ticketId,
     comment: jiraComment,
   });
   ```

**Files changed:**
- `src/main/execution/plugins/infrastructure/JiraWriteBackPlugin.ts` (+postJiraCommentWithOAuth, +transitionJiraIssueWithOAuth)
- `src/main/execution/plugins/infrastructure/JiraWriteBackIdempotent.ts` (route to correct function)
- `src/renderer/organization/CredentialResolver.ts` (add cloudId, isBearerToken)

**Runtime path:**
```
AutonomousOrchestrator
  → CredentialResolver (returns isBearerToken flag + cloudId)
  → postJiraCommentIdempotent (routes based on flag)
  → postJiraCommentWithOAuth (Bearer) OR postJiraComment (Basic)
  → Jira API
```

**Pros:**
- Preserves existing basic-auth functions unchanged
- No shared auth logic (keeps concerns separate)
- OAuth and basic paths are independent
- Clear code path selection
- Easy to understand

**Cons:**
- Code duplication (two nearly identical functions)
- Harder to maintain (changes to both functions)
- Future OAuth improvements must update both paths
- CredentialResolver object grows
- More complex idempotency wrapping

**Credential storage change:** NO
**IPC/preload change:** NO
**Comment path affected:** YES (fixed)
**Transition path affected:** YES (fixed)
**Basic-auth preserved:** YES (untouched)
**Idempotency preserved:** YES
**Live test required:** YES

---

### OPTION E: Unified Jira Authenticated Requester (Smallest Safe Change)

**Approach:**
Extract HTTP request logic into a unified `jiraFetch()` helper that handles both Bearer and Basic auth. Update write-back functions to use it.

**Changes required:**

1. **JiraWriteBackPlugin.ts** — Add helper:
   ```typescript
   function jiraFetch(
     url: string,
     options: RequestInit & { jiraAuth: 'bearer' | 'basic'; token?: string; email?: string },
   ): Promise<Response> {
     const { jiraAuth, token, email, ...fetchOptions } = options;
     const headers = fetchOptions.headers ?? {};
     
     if (jiraAuth === 'bearer') {
       headers.Authorization = `Bearer ${token}`;
     } else {
       const auth = Buffer.from(`${email}:${token}`).toString('base64');
       headers.Authorization = `Basic ${auth}`;
     }
     
     return fetch(url, { ...fetchOptions, headers });
   }
   ```

2. **JiraWriteBackPlugin.ts** — Update postJiraComment:
   ```typescript
   // Detect auth type and use appropriate call
   const isBearerToken = input.apiEmail === 'api@jira';
   
   return jiraFetch(
     `${input.jiraUrl}/rest/api/3/issue/${input.issueKey}/comments`,
     {
       method: 'POST',
       jiraAuth: isBearerToken ? 'bearer' : 'basic',
       token: input.apiToken,
       email: input.apiEmail,
       headers: { 'Content-Type': 'application/json' },
       body: JSON.stringify({...}),
     },
   );
   ```

3. **JiraWriteBackPlugin.ts** — Update transitionJiraIssue similarly

**Files changed:**
- `src/main/execution/plugins/infrastructure/JiraWriteBackPlugin.ts` (add jiraFetch helper, update 2 functions)

**Runtime path:**
```
AutonomousOrchestrator
  → CredentialResolver (returns placeholder + OAuth token)
  → postJiraComment (uses jiraFetch)
  → jiraFetch (detects bearer, constructs Bearer auth)
  → Jira API
```

**Pros:**
- Minimal code change (one file, one helper function)
- Very localized — no spreading changes across codebase
- Still detects via placeholder email (pragmatic)
- No CredentialResolver changes
- No IPC/preload changes
- No new files
- Backward compatible
- Idempotency untouched

**Cons:**
- Still uses placeholder 'api@jira' as magic value
- jiraFetch is specific to write-back (can't be reused by JiraConnector)
- Doesn't share auth logic with read path

**Credential storage change:** NO
**IPC/preload change:** NO
**Comment path affected:** YES (fixed)
**Transition path affected:** YES (fixed)
**Basic-auth preserved:** YES
**Idempotency preserved:** YES
**Live test required:** YES

---

## COMPARISON TABLE

| Aspect | A | B | C | D | E |
|--------|---|---|---|---|---|
| **Files changed** | 1 | 4 | 5 | 3 | 1 |
| **New files** | 0 | 1 | 0 | 0 | 0 |
| **Shared auth logic** | No | Yes | Yes | No | No |
| **Explicit vs magic string** | Magic | Explicit | N/A | Explicit | Magic |
| **CredentialResolver changed** | No | Yes | Yes | Yes | No |
| **JiraConnector refactored** | No | Yes | Yes | No | No |
| **IPC/preload changed** | No | No | Yes | No | No |
| **Comment path fixed** | Yes | Yes | Yes | Yes | Yes |
| **Transition path fixed** | Yes | Yes | Yes | Yes | Yes |
| **Basic-auth preserved** | Yes | Yes | Unclear | Yes | Yes |
| **Idempotency preserved** | Yes | Yes | Yes | Yes | Yes |
| **Code duplication** | No | No | No | Yes | No |
| **Regression risk** | Low | Medium | Medium | Low | Very Low |
| **Architectural clarity** | Low | Medium | High | Low | Very Low |

---

## RECOMMENDATION

**Option E (Unified Jira Authenticated Requester)** is the best choice.

### Rationale

1. **Minimal blast radius** — Only JiraWriteBackPlugin changes
2. **No cascading changes** — CredentialResolver, IPC, preload, tests unchanged
3. **Idempotency preserved** — Wrapping layer untouched
4. **Fast validation** — Only one file to review, test
5. **Low regression risk** — Magic string detection is already happening (via 'api@jira')
6. **Pragmatic** — Leverages existing credential shape, doesn't redesign
7. **Reversible** — If a better solution emerges later, write-back is isolated

### Why not the others?

- **A (inline detection):** Same as E but less readable; helper function is cleaner
- **B (shared helper):** Overkill refactoring; adds file+complexity for marginal reuse
- **C (extend JiraConnector):** Too much coupling; confuses read-only vs read-write concerns
- **D (dual functions):** Code duplication; harder to maintain both paths
- **E (this):** Sweet spot — minimal, focused, testable change

### Implementation (E)

```typescript
// JiraWriteBackPlugin.ts — add helper
function buildJiraHeaders(
  email: string,
  token: string,
): Record<string, string> {
  const isBearerToken = email === 'api@jira';
  
  if (isBearerToken) {
    return { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
  }
  
  const auth = Buffer.from(`${email}:${token}`).toString('base64');
  return { Authorization: `Basic ${auth}`, 'Content-Type': 'application/json' };
}

// Update postJiraComment (line 31-73)
export async function postJiraComment(input: JiraCommentInput): Promise<JiraWriteBackResult> {
  try {
    const headers = buildJiraHeaders(input.apiEmail, input.apiToken);
    
    const response = await fetch(`${input.jiraUrl}/rest/api/3/issue/${input.issueKey}/comments`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        body: {
          type: "doc",
          version: 1,
          content: [{ type: "paragraph", content: [{ type: "text", text: input.comment }] }],
        },
      }),
    });
    // ... rest unchanged
  }
}

// Update transitionJiraIssue similarly (line 78-138)
```

**Changes:** 
- Add helper function (6 lines)
- Update postJiraComment (change 2 lines: header construction + fetch call)
- Update transitionJiraIssue (change 3 lines: two header constructions + one fetch call)
- Total: ~11 lines changed

**Tests:** Update mocks to verify both Bearer and Basic auth paths work

---

## DESIGN STATUS

```
RECOMMENDED OPTION: E (Unified Jira Authenticated Requester)

FILES EXPECTED TO CHANGE:
  - src/main/execution/plugins/infrastructure/JiraWriteBackPlugin.ts (ONLY file)

CREDENTIAL STORAGE CHANGE REQUIRED: NO
IPC/PRELOAD CHANGE REQUIRED: NO
COMMENT PATH AFFECTED: YES (fixed — will accept Bearer token)
TRANSITION PATH AFFECTED: YES (fixed — will accept Bearer token)
EXISTING BASIC-AUTH SUPPORT PRESERVED: YES
IDEMPOTENCY ARCHITECTURE PRESERVED: YES
LIVE JIRA TEST REQUIRED: YES (after implementation)

NEXT STEP: Implement Option E with the helper function + auth header logic
```

---

**Audit Completed:** 2026-09-08  
**Ready for Implementation:** YES (after user approval)
