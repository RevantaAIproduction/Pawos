# VALIDATION_MATRIX.md

| Feature | Expected Behavior | Validation Method | Status | Evidence |
|---|---|---|---|---|
| Runtime wiring | Canvas attach starts `PawOSPetApp`; detach stops loop | Code review + run locally | Not Verified | Not provided in this environment |
| Settings apply instantly | Changing settings updates active runtime | Change setting + observe motion/behavior | Not Verified | Not provided |
| Pet loading | Pet config loads and animations render | Observe pet assets + animation transitions | Not Verified | Not provided |
| Pet switching | Select pet changes runtime pet definition | Switch pet + observe behavior | Not Verified | Not provided |
| Keyboard reactions | Mapped keys trigger FSM transitions | Keyboard input test | Not Verified | Not provided |
| Mouse reactions | Move/click triggers follow/chase/happy | Mouse input test | Not Verified | Not provided |
| FSM transitions | FSM enters expected states | Instrument/log or observe animations | Not Verified | Not provided |
| Physics engine | Pet stays within bounds, moves smoothly | Observe collisions/motion | Not Verified | Not provided |
| Idle detection | Idle → lie → sleep | No input for thresholds | Not Verified | Not provided |
| Click-through | Background transparent, click-through window behavior | OS-level click-through test | Not Verified | Not provided |
| Audio playback | Triggers play unless muted | Test audio triggers | Not Verified | Not provided |
| IPC | Settings + pet list/load works | UI + IPC test | Not Verified | Not provided |
| Build (renderer) | `npm run build:renderer` passes | Capture logs | Not Verified | Not captured |
| Build (main) | `npm run build:main` passes | Capture logs | Not Verified | Not captured |
| Packaging | `npm run package` generates Windows artifacts | Verify artifact paths | Not Verified | Not confirmed |

