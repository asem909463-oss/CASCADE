# CASCADE — Board Logic Test Specification (30 tests)

**QA owner:** Claude
**Status:** Specification only. **No test in this file has been run or has passed.** There is no game code in the repository yet.
**Rules baseline:** `docs/PRODUCT_SPEC.md` (8×8, five colours, orthogonal matching, groups of at least two, game over when no valid group remains).

Tests marked **[PENDING FORMULA]** cannot have exact numeric expectations until Manus proposes and the product owner approves the score and chain formulas. Their property-level checks can be written now.

## 1. Conventions

**Board notation.** Rows are listed top to bottom (row 0 is the top). Columns are left to right (column 0 is the left). A cell is `(row, col)`. Colours are `R G B Y P`. `.` is an empty cell.

**Column notation.** A column is written as 8 characters, top to bottom. Example: `RGB.YPRG`.

**Dead filler board `F`.** `F(r,c) = "RGBYP"[(2r + 3c) mod 5]`. No two orthogonally adjacent tiles are equal, so `F` has **no valid move**. Its 8 rows:

```
row0: R Y G P B R Y G
row1: B R Y G P B R Y
row2: P B R Y G P B R
row3: G P B R Y G P B
row4: Y G P B R Y G P
row5: R Y G P B R Y G
row6: B R Y G P B R Y
row7: P B R Y G P B R
```

`F` also contains diagonal same-colour pairs, for example `(3,3)=R` and `(4,4)=R`. Most fixtures below are `F` with one or two cells overwritten.

**Independent oracle.** The test suite includes a small flood-fill helper (`oracleGroup(board, r, c)`) written separately from the engine. Every fixture asserts its own precondition with the oracle before the engine runs, so a typo in a fixture is caught as a fixture error and not as an engine bug.

**Stage functions.** To test each phase on its own, QA needs the engine to expose (or QA tests through an equivalent seam):

| Stage | Meaning |
| --- | --- |
| `findGroup(board, r, c)` | Connected same-colour tiles, or an empty/invalid result |
| `removeGroup(board, group)` | Board with the group set to empty |
| `applyGravity(board)` | Tiles fall down each column |
| `collapseColumns(board)` | Empty columns removed toward the left |
| `refill(board, nextColumn)` | New columns enter from the right using an injected column source |
| `hasValidMove(board)` | At least one group of size ≥ 2 exists |
| `applyMove(state, r, c, nextColumn)` | Full pipeline returning the new state, score change and a step log |

Stage tests may use boards with `.` cells. Full-pipeline tests use full boards and an injected `nextColumn` so refill is deterministic.

**Global invariants (checked after every test and in randomized runs).**

- I1: Board is exactly 8 rows × 8 columns after every completed move.
- I2: After gravity, no empty cell lies below a filled cell in any column.
- I3: Surviving tiles keep their relative vertical order within a column.
- I4: No tile is created or lost except by removal and refill (count before − removed + refilled = count after).
- I5: Input board is never mutated.
- I6: Score is a non-negative safe integer and never decreases.
- I7: Same state + same move + same refill source → identical result.
- I8: Invalid input changes nothing (deep-equal state, no score change, no events).

## 2. Group selection and removal

### T01 — Minimum legal group
- **Setup:** `F` with `(7,2)=B`. Oracle precondition: group of `(7,1)` is exactly `{(7,1),(7,2)}`.
- **Action:** Tap `(7,1)`. Repeat on a fresh state by tapping `(7,2)`.
- **Expected:** Exactly those two cells removed, from either tap. After gravity, only columns 1 and 2 change: column 1 becomes `.YRBPGYR`, column 2 becomes `.GYRBPGY`. All other columns equal `F`. (A new adjacency `G G` appears at `(1,2)`/`(1,3)`; that is expected.)
- **Catches:** off-by-one group size, removing too many/few tiles, asymmetric selection.

### T02 — Single tile is not a move
- **Setup:** `F`. Oracle precondition: every cell has group size 1.
- **Action:** Tap `(3,3)`, then a corner, then an edge cell.
- **Expected:** Each tap rejected. State deep-equal to before, score unchanged, move counter unchanged, no animation event. (I8)

### T03 — Other same-colour group is untouched
- **Setup:** `F` with `(7,2)=B` and `(0,3)=B`. Oracle: groups `{(7,1),(7,2)}` and `{(0,3),(0,4)}`.
- **Action:** Tap `(7,1)`.
- **Expected:** Only the bottom pair is removed. `(0,3)` and `(0,4)` are still `B` and not moved. A second tap on `(0,3)` is then legal and removes exactly that pair.
- **Catches:** colour-wide removal instead of connected-group removal.

### T04 — Corner and edge groups
- **Setup A:** `F` with `(1,0)=R`. Oracle: group of `(0,0)` is `{(0,0),(1,0),(1,1)}`.
- **Setup B:** `F` with `(6,7)=R`. Oracle: group of `(7,7)` is `{(7,7),(6,7),(6,6)}`.
- **Action:** Tap `(0,0)` on A, tap `(7,7)` on B.
- **Expected:** Exactly 3 tiles removed in each, no out-of-bounds access or exception.
- **Parametrised extension:** For every border cell and each in-bounds neighbour, overwrite one cell to make a pair; skip cases where the oracle says the group is not exactly 2; assert exact removal.

### T05 — Diagonal and gapped same-colour tiles are not connected
- **Setup A:** `F` unchanged. `(3,3)=R` and `(4,4)=R` are diagonal; `(3,4)=Y` and `(4,3)=B`.
- **Setup B:** `F` with `(7,5)=Y`. `(7,3)=Y`, `(7,4)=G`, `(7,5)=Y`.
- **Action:** Tap `(3,3)` on A. Tap `(7,3)` and `(7,5)` on B.
- **Expected:** All rejected (group size 1).

### T06 — Out-of-bounds and malformed taps
- **Action:** Tap `(-1,0)`, `(0,-1)`, `(8,0)`, `(0,8)`, `(1.5,2)`, `(NaN,0)`, `(null,undefined)`, `("3","4")`.
- **Expected:** All rejected without exception. State unchanged (I8).

## 3. Gravity

Stage test on one column (other columns empty). Columns are 8 characters, top to bottom.

### T07 — One gap with tiles above
- **Input column:** `RGB.YPRG` **Expected:** `.RGBYPRG`

### T08 — Gaps at several positions
- **Input column:** `.R.G..B.` **Expected:** `.....RGB` (order R, G, B preserved)

### T09 — Entire column empty
- **Input column:** `........` **Expected:** `........`, no exception.

### T10 — Already settled column
- **Input column:** `...RGBYP` **Expected:** unchanged. Also assert the function returns an equal board and does not mutate its input.

## 4. Column collapse and refill

Stage test using columns c0…c7. Unspecified columns are empty.

### T11 — Empty column between two filled columns
- **Input:** c0 `.......R`, c2 `......GB`
- **Expected after collapse:** c0 `.......R`, c1 `......GB`, c2–c7 empty.

### T12 — Several empty columns including both edges
- **Input:** c1 `.......R`, c4 `......GB`
- **Expected after collapse:** c0 `.......R`, c1 `......GB`, c2–c7 empty. Left-to-right order of surviving columns unchanged.

### T13 — Refill restores exactly 8 columns
- **Input:** only c5 `....RGBY`, injected `nextColumn` returning labelled columns `X1, X2, …`.
- **Expected:** c0 `....RGBY` (collapsed), then 7 new columns from the source. Board is 8 wide. The source is called exactly 7 times. **Open question:** in which order do new columns occupy the empty slots (first-drawn leftmost or rightmost)? See `SPEC_REVIEW.md` item 2. Assertions on order wait for that decision.

## 5. Chain reactions **[PENDING FORMULA]**

The spec says "Chain reactions can award score multipliers or bonuses" and leaves the chain formula and timing window open. Because tapping removes one group and nothing clears automatically, "chain" most likely means a streak of consecutive moves. The definition must be confirmed. See `SPEC_REVIEW.md` item 1.

### T14 — Chain starts, continues, and resets
- **Property now:** the engine exposes a deterministic chain/streak state; it increments only under the documented condition and resets under the documented condition.
- **Exact values:** after approval.

### T15 — Chain depth across three or more consecutive moves
- Each step's points and multiplier are recorded in the step log in order. The sum of step points equals the total score change.

### T16 — Chain does not depend on wall-clock timing unless specified
- If a timing window exists, it is driven by an **injected clock**. Tests advance the fake clock to just inside and just outside the window and assert the exact boundary behaviour. Real timers must not decide a move's score.

### T17 — Bound on chain length and multiplier
- A very long streak (for example 10,000 simulated moves) never overflows, produces `NaN`/`Infinity`, or exceeds any documented multiplier cap.

## 6. Scoring **[PENDING FORMULA for exact numbers]**

### T18 — Larger groups score more (property, can be written now)
- For group sizes 2 through 64, `score(n+1) > score(n)`. Fails if two sizes tie or a larger group scores less.

### T19 — Determinism
- The same board, same tap and same chain state give the same score every time, on repeated runs and after a save/restore.

### T20 — Score is a safe non-negative integer
- Randomized play to game over: every per-move and total score satisfies `Number.isSafeInteger(x) && x >= 0` and total never decreases (I6). Include the largest possible group (64 tiles).

### T21 — Score independent of animation and input timing
- The score for a move is identical whether animations are skipped, slowed, or reduced-motion is on.

## 7. Invalid moves

### T22 — Tap on an empty cell (stage board with `.`)
- **Expected:** rejected, state unchanged (I8).

### T23 — Rejected tap leaves state byte-for-byte unchanged
- Compare serialised state before and after rejected taps from T02/T06. Also assert no event was emitted and no save was written.

### T24 — Tap during resolution
- Start a legal move, then tap again at each step: removal, gravity, collapse, refill, score update. Second tap must be ignored or explicitly queued per the documented behaviour, and must never produce overlapping mutations.

### T25 — Tap after game over
- After the engine reports game over, any tap is rejected and score does not change.

## 8. Game over

### T26 — Dead board
- **Setup:** `F`. **Expected:** `hasValidMove` is false and the game reports game over.

### T27 — Exactly one move left
- **Setup:** `F` with `(7,2)=B`. **Expected:** `hasValidMove` is true, game is not over.

### T28 — Whole board cleared
- **Setup:** a board where every tile is `R`. **Action:** tap any tile.
- **Expected:** group size 64 removed, all 8 columns empty, 8 new columns refilled from the injected source. Game is **not** over unless the refilled board is dead (then it is). Score equals the approved formula for size 64.

### T29 — Game over is evaluated after the whole move resolves
- **Setup:** `F` with `(0,1)=R`. Oracle: group of `(0,0)` is `{(0,0),(0,1),(1,1)}`; these are top-of-column tiles, so removal moves nothing by gravity.
- **Action:** Tap `(0,0)`.
- **Expected:** 3 tiles removed, no tile moves, no empty column, the remaining board has no valid group, so game over is reported after this move and the final score includes this move.

### T30 — Generated boards always start playable
- Over 10,000 seeds, the initial board is 8×8, uses only the five colours, and has at least one valid group. Repeat for each Daily Challenge date in a full year for the current ruleset version. Also record the distribution of largest-group size and valid-move count so product can judge difficulty (the distribution itself is an open product decision).

## 9. Randomized and property runs

- **Fuzz:** 1,000+ seeded games, each played by a random legal-move bot to game over, checking I1–I8 after every step. Any failure must print the seed and move list.
- **Replay:** every game's seed and move list replayed from scratch must reproduce the same final board and score (I7).
- **Cross-version guard:** a stored "golden" run (seed, ruleset version, moves, final score and board hash) kept in the test folder. Any intentional rule change updates it and the ruleset version in the same commit.

## 10. Result log (to be filled with real output only)

| Date | Commit | Command | Result |
| --- | --- | --- | --- |
| — | — | — | Not run: no engine code exists yet |
