# Autonomous Billing Recovery Workflow

## Overview

This document describes recovery procedures for rare edge cases in autonomous task billing, specifically when the UsageEventStore checkpoint becomes corrupted or inconsistent.

---

## Checkpoint Architecture

The UsageEventStore maintains a persistent ledger of all usage events during autonomous task execution:

- **Location**: `%APPDATA%/PawOS/usageEventStore.json` (main process)
- **Contents**: Array of NormalizedUsageRecord entries
- **Max Size**: 2000 entries (FIFO eviction)
- **Triggers**: Append on turn completion, checkpoint written on every append

### Checkpoint Structure

```json
{
  "records": [
    {
      "requestId": "uuid",
      "runId": "autonomous-run-uuid",
      "normalizedCompute": 1234,
      "timestamp": "2026-09-06T12:00:00Z",
      "sessionId": null
    }
  ],
  "recovered": false
}
```

---

## Failure Scenarios & Recovery

### Scenario 1: Corrupted Checkpoint File

**Symptoms**:
- Autonomous task marked as `blocked`
- Logs show `UsageEventStore: checkpoint corrupted`
- Settlement not attempted

**Recovery**:
1. Backup: `cp usageEventStore.json usageEventStore.json.backup`
2. Clear: `rm usageEventStore.json`
3. Restart Electron
4. File auto-initializes on next startup

### Scenario 2: Settlement RPC Failed

**Symptoms**:
- Run marked as `failed`
- Usage events recorded in UsageEventStore
- Wallet NOT charged

**Recovery**:
1. Inspect usage: `cat usageEventStore.json | jq '.records[] | select(.runId == "ID")'`
2. Verify wallet unchanged
3. Retry settlement via Supabase RPC (idempotent)

### Scenario 3: Recovery Flag (Data Loss Detected)

**Symptoms**:
- `recovered: true` in checkpoint diagnostics
- 0 PC charged due to lost usage events

**Recovery**:
1. If repair possible, restore from backup
2. Otherwise clear and reinitialize
3. User experienced zero cost — no refund needed
4. Can retry autonomous task

---

## Monitoring

Monitor logs for early warning:
```
- "checkpoint corrupted" → file integrity issue
- "SETTLEMENT_RPC_CALL" failures → network/RPC issues
- "USAGE_EVENT_APPEND" absence → no recording happening
```

Check disk space regularly — checkpoint fails if <100MB free.

---

## Escalation

If recovery steps fail:
1. Collect: checkpoint backup + logs + wallet state
2. Contact engineering team
3. Options: force close, admin override, rollback from backup
