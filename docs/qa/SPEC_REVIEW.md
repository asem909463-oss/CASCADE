# CASCADE — QA Review of Spec, Workflow and QA Plan

**Reviewer:** Claude (QA)
**Reviewed:** `docs/PRODUCT_SPEC.md`, `docs/TEAM_WORKFLOW.md`, `docs/QA_PLAN.md` on `main` (merge commit `d824054`, 2026-11-12).
**Scope:** document review only. There is no game or backend code to audit yet, and nothing has been run.

## 1. Decisions needed before tests can be finalised

These are gaps that would otherwise be resolved silently by whoever writes the code, which is how rule bugs get shipped.

| # | Question | Why it matters | Needed from |
| --- | --- | --- | --- |
| 1 | **What is a "chain reaction"?** A tap removes one group and nothing clears on its own, so a chain cannot be an automatic cascade unless gravity or refill is meant to trigger clears. Candidates: (a) consecutive taps within a time window; (b) consecutive taps meeting a condition such as group size; (c) automatic clears after refill (not in the spec). | Defines scoring, tests T14–T17, and whether wall-clock time affects a deterministic game. | Product owner + Manus |
| 2 | **Order and content of refill columns.** When k columns are empty, which new column goes in which slot, and how many tiles does each have (full height 8?). | Needed for determinism, Daily fairness and exact expected boards in T13. | Manus |
| 3 | **Score formula and group-size curve.** Currently open by design. | Exact assertions in T18–T21 wait for this. Property checks (strictly larger group scores more) can be written now. | Manus proposes, product owner approves |
| 4 | **Timing window for chains, if any.** | A real timer deciding score makes tests flaky and replays unreproducible. Requires an injectable clock. | Manus |
| 5 | **Is resume approved?** The spec says "save best score and recoverable game state locally", while `QA_PLAN.md` says resume is tested "only if approved". | QA will treat resume as **approved** and test it (S01–S17) unless told otherwise. | Product owner |
| 6 | **Daily Challenge date rule.** UTC date or local date? What happens when the device clock is changed? One attempt or unlimited? What ends a Daily run (game over, or a move limit)? | Determines D01–D06 and whether Daily needs server validation. | Product owner |
| 7 | **Random number generator and seed algorithm.** `Math.random` is not seedable. The algorithm, the integer-math rules (for example `Math.imul`, `>>> 0`) and how the seed is derived from date + ruleset version must be written down. | Determinism across iOS, simulator and unit-test runtimes depends on it. | Manus |
| 8 | **Is RNG state part of the save?** If not, a resumed run produces different refill columns from an uninterrupted one. | Breaks determinism and Daily fairness after any resume. | Manus |
| 9 | **When is best score updated?** At game over only, or after each move? | A force-quit mid-run could lose a new best score. | Manus |
| 10 | **Dead refill.** If refill columns produce a board with no valid group, is that game over immediately? | A run could end on a move the player had no part in. | Product owner |
| 11 | **Board thinning.** Tiles fall down but only whole columns refill, so rows near the top empty over time. Is that intended? | Affects late-game feel, game-over frequency and the 64-tile worst-case tests. | Product owner |
| 12 | **Selectable-group feedback.** The spec requires clear feedback for selectable groups. Is it a highlight before the tap or after? | The highlighted group must always equal the group that actually removes. Needs a test. | Manus |
| 13 | **Colour accessibility.** "Chosen for clear contrast and accessibility" — should tiles also differ by shape or pattern for colour-blind players? | Decides whether accessibility is verified by contrast checks only or also by non-colour cues. | Product owner |

## 2. Findings on the existing documents

| # | Document | Finding | Suggested change |
| --- | --- | --- | --- |
| A | `PRODUCT_SPEC.md` | "Chain reactions can award score multipliers" has no definition (see item 1). | Add a definition before implementation of scoring starts. |
| B | `PRODUCT_SPEC.md` | Refill behaviour is described as "new columns enter from the right" with no order or size rule (item 2). | Specify order, size and RNG consumption. |
| C | `PRODUCT_SPEC.md` | Daily Challenge says "versioned seed/ruleset" but not the algorithm or date rule. | Specify items 6 and 7. |
| D | `QA_PLAN.md` | Says "Different dates map to the intended daily seeds" and a timezone test but does not say which timezone rule is intended. | Update after item 6. |
| E | `QA_PLAN.md` | Persistence tests do not mention RNG state, chain state, or partial-write protection. | Covered in `PERSISTENCE_TEST_SPEC.md` S01, S02, S13. |
| F | `QA_PLAN.md` | No clock-injection requirement for timing-based scoring. | Add to the engineering requirements (item 4). |
| G | `TEAM_WORKFLOW.md` | The workflow says unfinished work must not go straight to `main` and that changes go through a pull request. The project owner has instructed QA to push QA documentation directly to `main`. Docs-only changes are low risk, but code and schema changes should keep the PR flow. | Record the exception, or keep docs on PR too. |
| H | `TEAM_WORKFLOW.md` | No continuous-integration check is defined, so "merge only after required checks pass" has nothing behind it. | Add a CI job for type check and unit tests once code exists. |
| I | `TEAM_WORKFLOW.md` | Repository name appears as `CASCADE` in the workflow and as `cascade` in the URL. GitHub treats them as the same repository, but scripts and CI config should use one spelling. | Pick one. |
| J | General | `main` currently contains documentation only; "main should remain buildable" has not yet been exercised. | Establish a build check with the first code merge. |

## 3. What QA needs from the implementation

1. A pure, UI-independent game engine with the stage functions listed in `BOARD_LOGIC_TEST_SPEC.md` (or equivalent seams).
2. Injectable random source and injectable clock.
3. A serialisable state object (board, score, chain state, RNG state, ruleset version) with a schema version.
4. A step log from `applyMove` that records every phase and its score contribution.
5. Test commands that run in CI without a simulator (for example `npm test`).

## 4. Status of testing

No tests have been run. No code exists to run them against. This review is based only on reading the documents above. The fixtures in `BOARD_LOGIC_TEST_SPEC.md` were checked with a throwaway script for arithmetic correctness (dead-filler board, group sizes, gravity results). That script is **not** a test of the game and says nothing about its correctness.
