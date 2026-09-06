# PawOS AUDIT ACTION ITEMS

**Tracking for**: Beta Launch → Limited Public → Production  
**Start Date**: 2026-09-06  
**Status**: Ready for assignment

---

## P0: MUST FIX BEFORE BETA (Week 1)

### Verification Tasks (No code changes, just testing)

- [ ] **VERIFY-001**: Launch Electron app, screenshot main window
  - **Owner**: QA Lead
  - **Success Criteria**: Window appears, no crash
  - **Estimated Time**: 2 hours
  - **Dependencies**: None
  - **Blockers**: None currently

- [ ] **VERIFY-002**: Test conversation endpoint-to-end
  - **Owner**: QA Lead
  - **Action**: Start conversation, wait for response from AI provider
  - **Success Criteria**: Response received within 30 seconds, content is coherent
  - **Estimated Time**: 4 hours
  - **Risk**: May reveal missing API keys or provider integration
  - **If Fails**: Check `.env` for GEMINI_API_KEY, verify provider authentication

- [ ] **VERIFY-003**: Create autonomous task via desktop app
  - **Owner**: QA Lead
  - **Action**: Navigate to Dashboard, click "Create Autonomous Task", select GitHub issue
  - **Success Criteria**: Task appears in list, `autonomous_task_runs` row created
  - **Estimated Time**: 2 hours
  - **Depends On**: GitHub connector available

- [ ] **VERIFY-004**: Verify autonomous task settlement
  - **Owner**: Backend Lead
  - **Action**: Query Supabase, check `organization_billing_events` for settled task
  - **Success Criteria**: `settled_at` is set, `settled_pc` matches usage
  - **Estimated Time**: 1 hour
  - **Depends On**: VERIFY-003

- [ ] **VERIFY-005**: Test tier gating — Pro user cannot create autonomous task
  - **Owner**: QA Lead
  - **Action**: Create test account with Pro tier, try to create autonomous task
  - **Success Criteria**: Button disabled or error message shows
  - **Estimated Time**: 2 hours
  - **Depends On**: Tier system wired to UI

- [ ] **VERIFY-006**: Force crash during autonomous settlement, verify recovery
  - **Owner**: Backend + QA Lead
  - **Action**: Kill process during settlement, restart, verify recovery flag behavior
  - **Success Criteria**: Settlement blocked, recovery workflow initiated
  - **Estimated Time**: 4 hours
  - **Risk**: May reveal gaps in checkpoint recovery

- [ ] **VERIFY-007**: Verify IPC authorization — non-member cannot access org data
  - **Owner**: Security Lead
  - **Action**: Two users, different orgs, attempt cross-org IPC call
  - **Success Criteria**: Request rejected with auth error
  - **Estimated Time**: 3 hours
  - **Depends On**: Multi-user test setup

---

### Configuration Tasks (Environment setup)

- [ ] **CONFIG-001**: Set Razorpay API keys in `.env`
  - **Owner**: DevOps
  - **Action**: Add RAZORPAY_KEY_ID and RAZORPAY_SECRET to `.env`
  - **Verification**: Payment checkout URL generation works
  - **Estimated Time**: 30 minutes

- [ ] **CONFIG-002**: Verify Gemini API credentials
  - **Owner**: Backend Lead
  - **Action**: Check GEMINI_API_KEY in `.env`, test API call
  - **Verification**: Conversation works end-to-end
  - **Estimated Time**: 30 minutes

- [ ] **CONFIG-003**: Verify Supabase staging environment
  - **Owner**: DevOps
  - **Action**: Confirm PAWOS_STAGING_URL and keys are correct
  - **Verification**: Desktop app connects and authenticates
  - **Estimated Time**: 30 minutes

---

## P1: MUST FIX BEFORE LIMITED PUBLIC (Week 2-4)

### Feature Completeness

- [ ] **FEATURE-001**: Verify GitHub connector wiring
  - **Owner**: Integration Lead
  - **Action**: Add GitHub connector from Settings → Connections, verify list of repos appears
  - **Success Criteria**: User can see repos, can select issues for autonomous tasks
  - **Estimated Time**: 8 hours
  - **Risk**: Connector may be architectural only, UI integration may be missing

- [ ] **FEATURE-002**: Verify Jira connector
  - **Owner**: Integration Lead
  - **Success Criteria**: Can authenticate and list Jira projects
  - **Estimated Time**: 8 hours

- [ ] **FEATURE-003**: Verify Slack connector
  - **Owner**: Integration Lead
  - **Success Criteria**: Can send/receive messages via Slack
  - **Estimated Time**: 8 hours

- [ ] **FEATURE-004**: Verify coding workspace
  - **Owner**: Coding Lead
  - **Action**: Open repository, browse files, verify file explorer works
  - **Success Criteria**: Can see file tree, click files, content displays
  - **Estimated Time**: 6 hours
  - **Risk**: Major feature, may have significant gaps

- [ ] **FEATURE-005**: Verify avatar rendering
  - **Owner**: Frontend Lead
  - **Action**: Launch app, take screenshot of companion avatar
  - **Success Criteria**: 3D model visible, animations play smoothly
  - **Estimated Time**: 4 hours
  - **Risk**: May require WebGL debugging or fallback handling

- [ ] **FEATURE-006**: Verify voice synthesis
  - **Owner**: Audio Lead
  - **Action**: Have companion speak a message, listen to output
  - **Success Criteria**: Voice is audible, quality is acceptable
  - **Estimated Time**: 4 hours

- [ ] **FEATURE-007**: Verify project creation and management
  - **Owner**: Product Lead
  - **Action**: Create project, add work items, track progress
  - **Success Criteria**: Project persists, work items editable
  - **Estimated Time**: 6 hours

---

### Security Hardening

- [ ] **SECURITY-001**: Audit all IPC handlers for authorization checks
  - **Owner**: Security Lead
  - **Action**: Review `src/main/ipc/ipc.ts`, ensure all handlers check user auth
  - **Success Criteria**: No handler accepts requests from unauthenticated renderer
  - **Estimated Time**: 8 hours
  - **Acceptance Criteria**: Security review document signed off

- [ ] **SECURITY-002**: Verify credential vault encryption
  - **Owner**: Security Lead
  - **Action**: Inspect CredentialsVault implementation, verify at-rest encryption
  - **Success Criteria**: OAuth tokens encrypted, not in plaintext
  - **Estimated Time**: 6 hours

- [ ] **SECURITY-003**: Verify no secrets in logs
  - **Owner**: Backend Lead
  - **Action**: Search logs for API keys, tokens, passwords
  - **Success Criteria**: No secrets found in error messages or debug logs
  - **Estimated Time**: 4 hours

---

### Stress Testing

- [ ] **STRESS-001**: Run 50 autonomous tasks concurrently
  - **Owner**: QA Lead
  - **Action**: Load test with concurrent task creation/settlement
  - **Success Criteria**: All tasks settle without race conditions, no data loss
  - **Estimated Time**: 8 hours
  - **Environment**: Staging

- [ ] **STRESS-002**: Conversation token limit testing
  - **Owner**: QA Lead
  - **Action**: Send 100+ conversation turns, verify token management
  - **Success Criteria**: No crashes, graceful degradation if token limit hit
  - **Estimated Time**: 6 hours

- [ ] **STRESS-003**: Large repository testing
  - **Owner**: Coding Lead
  - **Action**: Open repo with 50k+ files, verify file browsing speed
  - **Success Criteria**: App responds in <2 seconds per action
  - **Estimated Time**: 6 hours

- [ ] **STRESS-004**: Network failure recovery
  - **Owner**: Backend Lead
  - **Action**: Disconnect network during task execution, reconnect
  - **Success Criteria**: App queues messages, reconnects gracefully
  - **Estimated Time**: 6 hours

---

## P2: SHOULD FIX BEFORE PRODUCTION (Week 4-6)

### Documentation & Onboarding

- [ ] **DOCS-001**: Create user onboarding guide
  - **Owner**: Product Docs
  - **Estimated Time**: 8 hours

- [ ] **DOCS-002**: Create connector setup guides
  - **Owner**: Product Docs
  - **For**: GitHub, Jira, Slack, Google Workspace
  - **Estimated Time**: 12 hours

- [ ] **DOCS-003**: API documentation for developers
  - **Owner**: Backend Lead
  - **Estimated Time**: 8 hours

---

### Performance Optimization

- [ ] **PERF-001**: Profile Electron startup time
  - **Owner**: Frontend Lead
  - **Target**: <5 seconds
  - **Estimated Time**: 6 hours

- [ ] **PERF-002**: Optimize conversation message rendering
  - **Owner**: Frontend Lead
  - **Estimated Time**: 6 hours

- [ ] **PERF-003**: Memory usage profiling during long sessions
  - **Owner**: Frontend Lead
  - **Estimated Time**: 8 hours

---

### Microsoft Store Preparation

- [ ] **STORE-001**: Build MSIX package
  - **Owner**: DevOps
  - **Estimated Time**: 4 hours
  - **Depends On**: App passes all P0 + P1 tests

- [ ] **STORE-002**: Test MSIX install on clean Windows
  - **Owner**: QA Lead
  - **Estimated Time**: 4 hours

- [ ] **STORE-003**: Verify auto-update mechanism
  - **Owner**: DevOps
  - **Estimated Time**: 6 hours

- [ ] **STORE-004**: Code signing configuration
  - **Owner**: DevOps
  - **Estimated Time**: 2 hours

---

## P3: CAN IMPROVE LATER (Post-Launch)

- [ ] Web dashboard tier/billing management (v1.1)
- [ ] Mobile app (v1.1)
- [ ] Skills marketplace (v1.1)
- [ ] SSO/SAML for Enterprise (v1.2)
- [ ] Advanced audit logs (v1.2)
- [ ] Custom integrations (v2.0)

---

## TRACKING TEMPLATE

```
## Week 1 Progress

### P0 Items
- [ ] VERIFY-001: ✅ Complete / 🚧 In Progress / ❌ Blocked
- [ ] VERIFY-002: Status
- ...

### Blockers
- GitHub connector not wired to UI → Blocking FEATURE-001
- GEMINI_API_KEY missing → Blocking VERIFY-002

### Issues Found
1. App crashes on startup (fix assigned to [Name])
2. Conversation response takes 60s (performance issue)

### Next Week Focus
- Fix critical crashes
- Complete connector verification
- Start stress testing
```

---

## Success Metrics

**Beta Exit Criteria** (must all be ✅):
- ✅ All P0 verification tasks pass
- ✅ All critical connectors verified (GitHub, Slack, Jira)
- ✅ Zero data loss or corruption
- ✅ Crash-free 8-hour session
- ✅ Settlement accuracy 100% (10/10 tasks)

**Limited Public Exit Criteria**:
- ✅ All P1 items complete
- ✅ 50+ autonomous tasks through production without issues
- ✅ User feedback incorporated
- ✅ Support process tested

**Production Exit Criteria**:
- ✅ All P2 items complete
- ✅ Microsoft Store approval received
- ✅ Monitoring/telemetry in place
- ✅ Support team trained

---

## Risk Ownership

| Risk | Owner | Mitigation |
|------|-------|-----------|
| Electron crash on launch | Frontend Lead | Daily build + smoke test |
| AI provider not responding | Backend Lead | Fallback to cached responses |
| Autonomous task settlement fails | Backend Lead | Recovery safety mechanisms in place |
| Connector auth fails | Integration Lead | Detailed error messages + troubleshooting guide |
| Avatar rendering broken | Frontend Lead | Graceful degradation to text UI |
| Microsoft Store rejection | DevOps | Early submission for feedback |

---

**Report Date**: 2026-09-06  
**Next Review**: 2026-09-13 (1 week into beta)  
**Owner**: Product Management Team
