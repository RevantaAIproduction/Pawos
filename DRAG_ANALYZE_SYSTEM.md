# Drag & Analyze System - Corrected Architecture

## **Three Separate Cost Points**

### **1. Open from Browser = 0.30 PC** (fetch, load, parse)

When user drags Jira/Slack/Email from external browser into chat:

```
User drags: https://jira.company.com/browse/PROJ-123
     ↓
PawOS opens connection to Jira
PawOS fetches ticket content
PawOS parses & displays
     ↓
[🔗 Jira Ticket Opened
  PROJ-123: Fix login
  
  Content loaded...
  💰 0.30 PC
  [ Continue ]  [ Close ]
```

**Cost:** Fixed **0.30 PC**
- One-time cost to fetch & open
- Not charged if already loaded
- Tier-based monthly quota

### **2. Analyze Content = 0.10 PC** (AI analysis only)

User says "analyze this ticket":

```
[🔍 Analyzing PROJ-123...
  
  ████░░░░░░ 40% complete
  💰 0.10 PC
```

**Cost:** Fixed **0.10 PC**
- Separate charge from opening
- Only charged when user requests analysis
- Generates: summary + insights + action items
- Tier-based monthly quota

### **3. Reply/Comment = Normal Compute**

User replies or comments on the opened ticket:

```
"This bug is critical. We should prioritize the OAuth
fix and add tests. Let me create a PR for this."

[ Send ] (uses normal reasoning compute, no 0.30/0.10 surcharge)
```

**Cost:** Standard compute for that message
- No special 0.30 PC or 0.10 PC charge
- Regular AI reasoning
- Counts toward normal usage

---

## **Complete User Flow**

### **Scenario: Drag Jira Ticket, Analyze, Then Reply**

```
Step 1: User drags PROJ-123 from Jira
    ↓
    [🔗 Opening PROJ-123...
      💰 0.30 PC
      
    ✓ Opened
    PROJ-123: Fix authentication bug
    
    OAuth token refresh failing for 10% of users...
    
    [ Analyze ]  [ Close ]  [ Ignore ]

Step 2: User clicks "Analyze"
    ↓
    [🔍 Analyzing PROJ-123...
      ████████░░ 75%
      💰 0.10 PC
    
    ✓ Analysis complete
    
    Summary: Critical bug in OAuth token validation
    
    Key insights:
    • Race condition in token refresh
    • Affects new user signups
    • Requires immediate fix
    
    Action items:
    ☐ Fix token validation logic
    ☐ Add concurrent refresh test
    ☐ Deploy hotfix
    
    [ Close ]

Step 3: User types reply
    ↓
    User: "This is critical. Let me create a PR
           to fix the race condition and add tests."
    
    [ Send ] (no 0.30/0.10 charge, normal compute)
    
    PawOS: "I'll create a PR..."
    (normal AI response, uses standard compute)
```

**Total cost:** 0.30 PC (open) + 0.10 PC (analyze) + normal reasoning compute (reply)

---

## **Cost Breakdown by Tier**

### **Opening from Browser (0.30 PC each)**

| Tier | Monthly Free | After | Max Concurrent |
|------|-------------|-------|---|
| Go | 0 | 0.30 PC | 1 |
| Pro | 50 | 0.30 PC | 5 |
| Pro Max | 200 | 0.30 PC | 20 |
| Team | 1,000 | 0.30 PC | 100 |
| Enterprise | ∞ | FREE | 500 |

**Examples:**
- Go tier: 3 free opens = 0 PC, 4th = 0.30 PC (from balance)
- Pro: 50 free/month, then 0.30 PC each from balance
- Pro Max: 200 free/month, then 0.30 PC each
- Enterprise: All opens FREE

### **Analyzing Content (0.10 PC each)**

| Tier | Monthly Free | After | Max Concurrent |
|------|-------------|-------|---|
| Go | 0 | 0.10 PC | 1 |
| Pro | 100 | 0.10 PC | 5 |
| Pro Max | 500 | 0.10 PC | 20 |
| Team | 2,000 | 0.10 PC | 100 |
| Enterprise | ∞ | FREE | 500 |

**Examples:**
- Go tier: 0 free, every analyze = 0.10 PC
- Pro: 100 free/month, then 0.10 PC each
- Pro Max: 500 free/month, then 0.10 PC each
- Enterprise: All analyses FREE

### **Regular Replies/Comments**

No special charge. Uses standard compute allocation for that message.

---

## **Extension Types Implemented**

### **BrowserOpenExtension (0.30 PC)**

```typescript
{
  type: 'browser-open',
  status: 'opened' | 'opening' | 'failed',
  sourceUrl: 'https://jira.company.com/browse/PROJ-123',
  sourceTitle: 'PROJ-123: Fix authentication',
  platform: 'jira',
  resourceId: 'PROJ-123',
  cost: 0.30,
  canOpen: true,
  openedAt: timestamp,
  contentPreview: "OAuth token refresh failing..." // First 500 chars
}
```

**Shows:**
```
[🔗 PROJ-123: Fix authentication
  💰 0.30 PC (from tier allowance)
  
  OAuth token refresh failing for 10% of users...
  
  [ Analyze ]  [ Close ]
```

### **ContentAnalysisExtension (0.10 PC)**

```typescript
{
  type: 'content-analysis',
  status: 'analyzing' | 'complete' | 'failed',
  sourceUrl: 'https://jira.company.com/browse/PROJ-123',
  openId: 'open-123456', // Links to the open that created this
  progress: 75, // 0-100
  cost: 0.10,
  canAnalyze: true,
  result: {
    summary: 'Critical bug in OAuth token validation...',
    insights: [
      { type: 'blocker', title: 'Race condition', priority: 'critical' },
      { type: 'action-item', title: 'Fix validation logic' },
    ],
    keywords: ['oauth', 'auth', 'race-condition', 'token'],
    actionItems: ['Fix validation', 'Add tests', 'Deploy hotfix'],
    sentiment: 'negative'
  }
}
```

**Shows:**
```
[🔍 Analyzing PROJ-123
  💰 0.10 PC (from tier allowance)
  
  Summary: Critical bug in OAuth token validation
  
  Key insights:
  • Race condition in token refresh
  • Affects 10% of users
  
  Action items:
  ☐ Fix token validation logic
  ☐ Add concurrent refresh test
```

---

## **Monthly Budget Tracking**

### **Pro Tier Example**

User has: Pro ($20/mo), 1.50 PC balance, 12 opens used, 25 analyses used this month

```
Opens Budget:
  Monthly free: 50
  Used: 12
  Remaining: 38 free
  → Next 38 opens are FREE
  → 39th+ opens cost 0.30 PC from balance

Analysis Budget:
  Monthly free: 100
  Used: 25
  Remaining: 75 free
  → Next 75 analyses are FREE
  → 76th+ analyses cost 0.10 PC from balance

Compute Balance:
  Current: 1.50 PC
  Can afford: 15 additional opens (if quota exceeded)
  Can afford: 15 additional analyses (if quota exceeded)
```

---

## **Integration Points**

### **1. Drag Detection**

```typescript
onDragDrop(event) {
  const url = event.dataTransfer.getData('text/uri-list');
  
  // Create BrowserOpenExtension
  const openExt = createBrowserOpenExtension({
    sourceUrl: url,
    sourceTitle: extractTitle(url),
    platform: detectPlatform(url), // 'jira', 'slack', etc.
    userTier,
    userBalance,
    usedThisMonth,
  });
  
  // Check if can open
  if (!openExt.canOpen) {
    openExt.error = { code: 'insufficient-compute', ... };
    showToUser("Need 0.30 PC to open");
    return;
  }
  
  // Open it (deduct 0.30 PC or from quota)
  deductCompute(0.30, userTier, usedOpensThisMonth);
  openExt.status = 'opened';
}
```

### **2. Analyze Request**

```typescript
onAnalyzeClick(openId) {
  // Create AnalysisExtension
  const analysisExt = createContentAnalysisExtension({
    analysisId: 'analysis-' + Date.now(),
    sourceUrl: openExtension.sourceUrl,
    openId,
    userTier,
    userBalance,
    usedThisMonth,
  });
  
  // Check if can analyze
  if (!analysisExt.canAnalyze) {
    analysisExt.error = { code: 'insufficient-compute', ... };
    showToUser("Need 0.10 PC to analyze");
    return;
  }
  
  // Analyze (deduct 0.10 PC or from quota)
  deductCompute(0.10, userTier, usedAnalysesThisMonth);
  analysisExt.status = 'analyzing';
  
  // Get AI analysis
  const result = await analyzeContent(openExtension.content);
  analysisExt = completeAnalysis(analysisExt, result);
}
```

### **3. Normal Reply**

```typescript
onSendReply(message) {
  // No 0.30 PC or 0.10 PC charge
  // Regular reasoning compute only
  conversation.submitTranscript(message);
}
```

---

## **Files Implemented**

✅ **BrowserOpenExtensionTypes.ts**
- BrowserOpenExtension (0.30 PC)
- ContentAnalysisExtension (0.10 PC)
- Tier limits for opens & analyses
- Separate monthly quotas

✅ **BrowserOpenExtensionHelpers.ts**
- Factory functions for both extension types
- Cost checking: checkCanOpen(), checkCanAnalyze()
- Budget tracking: getRemainingBudget()
- Status updates: updateBrowserOpen(), completeAnalysis()

---

## **Status**

✅ **BUILD:** EXIT 0
✅ **TYPES:** Full TypeScript coverage
✅ **PRICING:** Correct separation of costs
✅ **TIER LIMITS:** Implemented with separate quotas

**Ready to implement handlers for:**
- Drag detection → open (0.30 PC)
- Analyze click → analysis (0.10 PC)
- Send reply → normal compute (no surcharge)

---

**The system is now correctly architected with:**
- **Opening from browser: 0.30 PC** (fetch, load, parse)
- **Analyzing content: 0.10 PC** (AI analysis)
- **Regular replies: normal compute** (no special charge)

All tier quotas implemented separately. ✨
