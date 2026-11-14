# Chronicle scoring calibration (internal only)

This document and `src/analysis/scoringSimulator.js` are research artifacts. No simulated value is added to a Chronicle report, profile, API payload, or cloud record. The simulator returns `null` until there are sufficient direct outcome records. It does not assign an archetype.

## Evidence eligibility

Candidate outcome evidence must be explicitly classified `confirmed`, have high or medium confidence according to the selected threshold, carry a valid opaque evidence reference included in the observation, and link to a session and a project-scoped engineering episode. The referenced observation must have complete, non-zero, non-truncated evidence coverage. Probable observations, lexical heuristics, unavailable evidence, unapproved sources, unsupported signals, and ordinary activity counts are excluded. Conflicting labels for the same project/evidence identity are excluded. Evidence from different projects is never merged. A repeated report ID is ignored; repeated evidence in distinct snapshots is deduplicated by project identity plus evidence reference.

Missing or unapproved sources are “not assessed,” never adverse. Coverage, confidence, evidence class, and evidence quantity are separate outputs. The simulator does not use commit/session/tool-call volume, elapsed time, or temporal proximity as a quality or productivity measure. A successful later event is not treated as recovery unless direct outcome evidence links it to the original failure.

## Candidate thresholds

| Preset | Reference coverage | Independent sessions | Project episodes | Outcome confidence |
| --- | ---: | ---: | ---: | --- |
| Exploratory | 60% | 2 | 1 | Medium or high |
| Balanced | 80% | 3 | 2 | Medium or high |
| Conservative | 90% | 5 | 3 | High |

The thresholds are calibration alternatives, not validated production cutoffs. Each candidate requires at least as many distinct measured outcomes as its session minimum. Comparisons are deterministic and do not alter a report.

## Candidate formula

For eligible, directly measured outcomes only:

`100 × positive outcomes / (positive outcomes + directly evidenced adverse outcomes)`

Missing outcomes are omitted from both sides. They are not failures. The candidate is withheld if any sufficiency gate fails. The formula is intentionally simple for calibration and is not a validated psychometric scale; category-specific evidence contracts and outcome adjudication are still required before production use.

## Dimension evidence contracts and current limits

| Dimension | Evidence required before it could qualify | Adverse evidence | Current report limitation |
| --- | --- | --- | --- |
| Planning | Explicit plan/decomposition record, revision history, ordered execution link, and direct evidence of whether planned work was carried through | Explicitly linked, observed divergence or unresolved plan outcome | Codex plan records currently omit plan content and whether it was followed; lexical planning indicators are heuristic. No direct outcome contract exists. |
| AI Steering | Explicit developer correction/redirection linked to the agent response and independently observable result | Directly linked failed or unresolved result after the steering action | `correction_followups` proves sequence only; it does not show the correction worked. |
| Execution Leverage | Explicit delegation/parent-child relationship, direct link to resulting changes, and review/acceptance evidence; parallel work needs explicit relationships | Explicitly observed delegated work rejected, abandoned, or requiring rework, with linkage | Session and orchestration records do not prove authorship or that agent work entered an accepted change. Counts are not productivity. |
| Engineering Quality | Explicit test/build/type-check/review outcomes linked to episodes, including attempted versus passed/failed state | A direct failing check or review outcome; missing checks are not adverse | Current verification observations can be tool-name heuristics and do not establish complete outcomes. |
| Product Thinking | Explicit requirement, user-impact decision, or scope trade-off linked to a recorded engineering outcome | Explicit evidence that the decision failed its stated acceptance/user criterion | Product-language observations are lexical heuristics; decision content is not retained. |

The current v7 report contract contains observations and evidence coverage, not the dimension-specific adjudicated outcome records above. Therefore, real saved reports should generally yield “insufficient evidence.” Synthetic fixtures in tests add simulator-only outcome records and are labeled as synthetic; they demonstrate arithmetic and gates only, not developer performance or real-world validity.

## Before production scoring

Chronicle still needs: versioned, privacy-safe outcome evidence contracts per dimension; representative manually reviewed datasets spanning manual-first, AI-assisted, and hybrid work; independent adjudication of positive/adverse labels; inter-rater agreement; threshold sensitivity and fairness analysis; and explicit approval of a calibrated methodology. No such validation is claimed by this research phase.
