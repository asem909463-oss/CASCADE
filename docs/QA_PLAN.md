# CASCADE — Initial QA & Test Plan

**QA and implementation owner:** ChatGPT  
**Status:** Test plan and release checklist; every result must be verified against the current commit.

## 1. Pure game-engine tests

Build deterministic unit tests for the board engine. Use fixed board fixtures and assert exact resulting boards.

### Group selection and removal
- A single tile is not a legal move.
- Two matching orthogonally adjacent tiles form a legal group.
- Three- and larger connected groups are selected completely.
- Diagonal-only matches are not connected.
- Same-colour tiles separated by another tile are not connected.
- Removal affects exactly the selected connected group and no other tile.

### Gravity
- Tiles above empty spaces fall to the lowest available positions.
- Relative vertical order of surviving tiles is preserved.
- No tile is duplicated or lost.
- A column with no gaps remains unchanged.
- Multiple gaps in one column resolve correctly.

### Column collapse and refill
- Empty columns collapse to the left in the correct order.
- Non-empty columns preserve their internal tile order.
- New columns enter from the right until the board is exactly 8 columns wide.
- Full-board invariants hold after every completed move.

### Scoring and chains
- Score is deterministic for a given move and board.
- Larger groups receive the intended greater reward.
- Chain bonuses apply only when the defined chain rules are met.
- Multipliers reset at the correct time.
- Score never becomes negative or overflows its supported numeric range.

The score curve and chain timing must be approved before writing expected numeric score assertions.

### Move validity and game over
- Only groups of at least two are selectable.
- Invalid taps do not change board, score or move state.
- A legal move prevents game over.
- Game over is detected when no legal group remains.
- Edge and corner groups are handled correctly.

### Randomness and daily challenge
- A fixed seed always produces the same board sequence for the same ruleset version.
- Different dates map to the intended daily seeds.
- Device timezone changes do not cause different daily challenges for players in the same challenge region/date.
- Seed or ruleset version changes are explicit and testable.

## 2. Persistence and offline tests

- Best score survives app restart.
- An interrupted run restores only if resume is an approved feature.
- Invalid or corrupted save data is handled safely without crashing.
- Schema/version migrations preserve compatible data.
- A failed cloud request does not erase a valid local save.
- Gameplay remains usable in airplane mode.
- Reconnection does not duplicate submissions or overwrite a newer save with stale data.

## 3. UI and interaction tests

- Rapid repeated taps cannot trigger overlapping board mutations.
- Input is disabled only for the intended animation/transition window.
- Board remains usable across supported iPhone screen sizes and safe areas.
- Reduced-motion and sound/haptics settings are respected.
- Text, colour and selection states remain legible.
- App background/foreground transitions do not corrupt a move or save.

## 4. Performance and reliability

- Measure cold start, frame pacing during removal/gravity/refill, memory use and long-session stability.
- Test low-end supported iPhones as well as current devices.
- Check for leaked animation handles, subscriptions and timers.
- Verify app recovery after backgrounding, interruption and force quit.
- Record device, OS, build, steps and logs for every performance issue.

## 5. Backend security tests (when backend exists)

- Exposed tables have deliberate RLS policies.
- Anonymous/authenticated users cannot read or modify another player's private data.
- Service-role credentials never appear in client bundles, logs or repository history.
- Score submissions are validated server-side; client score values are not trusted.
- Duplicate submissions and replay attempts are handled.
- Daily challenge identifiers and dates are validated server-side.
- Edge Functions validate authentication, input shape, bounds and rate limits.
- Cloud-save conflict handling is deterministic and documented.

## 6. Bug report template

For each finding, report:
- Severity: Critical / High / Medium / Low.
- Build and commit SHA.
- Device and OS.
- Exact reproduction steps.
- Expected result.
- Actual result.
- Logs, screenshot or recording.
- Suspected file/function (only when supported by evidence).
- Suggested fix and retest result.

## 7. Release gates

Do not recommend release until:
- All critical and high-severity defects are fixed or explicitly accepted.
- Core game-engine tests pass.
- Persistence and offline tests pass.
- Backend security review passes for shipped online features.
- iOS device testing is completed.
- No visible placeholder or nonfunctional controls remain.
- Crash, performance and privacy checks are reviewed.
- The public privacy policy URL is live and matches the app's actual data practices.
- App Store privacy disclosures match the app's SDKs and actual behavior.
- A native iOS archive is built and validated; a JavaScript export alone is not a release build.
- The exact release commit and build are identified.

**Important:** This is a test plan, not a claim that any tests have run or passed.
