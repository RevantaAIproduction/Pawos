# Phase 3 Runtime Verification Plan

## Actual Call Chain (Verified in Code)

### TEST A Path: Autonomous Execution → Actual PC

```
AutonomousOrchestrator.executeAutonomousTask()
├─ ConversationRuntime.submitTranscript() [REAL, no mocks]
│  ├─ [Model turn execution through real runtime]
│  └─ onTurnUsage() → billingRecordAutonomousTurnUsage()
│     └─ Called at line 261: bridge.billingRecordAutonomousTurnUsage(submission)
│
├─ bridge.billingFlushUsageEvents(runId)
│  └─ Line 598: Flushes UsageEventStore events to DB
│
└─ bridge.billingSettleAutonomousRun(runId)
   └─ Line 599: Calls settle_autonomous_task_run_pc RPC
      └─ Reads UsageEventStore events
      └─ Calculates actual PC from recorded usage
      └─ Creates billing event
      └─ Updates wallet
```

### Call Stack:
- AutonomousOrchestrator.ts:261 → bridge.billingRecordAutonomousTurnUsage
- AutonomousOrchestrator.ts:598 → bridge.billingFlushUsageEvents
- AutonomousOrchestrator.ts:599 → bridge.billingSettleAutonomousRun

### TEST B Path: Usage Recording Failure

Inject failure at:
- UsageEventStore.append() inside billingRecordAutonomousTurnUsage
- Verify turn fails and run doesn't complete successfully

### TEST C Path: Tier Compute Isolation

Verify:
- Normal conversation calls CreditStore.consume()
- Autonomous execution does NOT call CreditStore.consume()
- Autonomous Work PC wallet is charged instead

## Limitations (Current Implementation)

1. **Cannot execute real Gemini API**: Would need live API keys in test
2. **Provider response must be controlled**: But all other infrastructure is real
3. **Database is Pawos Staging**: Real environment, acceptable for verification

## Verdict Criteria

- **TEST A PASS**: Real runtime chain executes, UsageEventStore records match billing
- **TEST B PASS**: Injected failure prevents successful completion
- **TEST C PASS**: Separate accounting paths verified

ONLY if all three pass = **READY FOR PRODUCTION**
