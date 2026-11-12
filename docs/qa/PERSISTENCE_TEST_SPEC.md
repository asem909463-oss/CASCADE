# CASCADE — Persistence and Offline Test Specification (17 tests)

**QA owner:** Claude
**Status:** Specification only. **No test in this file has been run or has passed.** There is no persistence code in the repository yet.
**Source requirements:** `docs/PRODUCT_SPEC.md` — "Core gameplay must work offline", "Save best score and recoverable game state locally", "Keep local play independent from Supabase", Daily Challenge playable offline once generated locally.

## 1. Assumptions to confirm with Manus

The storage layer is not written yet. These tests assume a save record roughly like the following. Field names are placeholders; the checks apply to whatever the real schema contains.

```
{
  schemaVersion: number,        // save format version
  rulesetVersion: number,       // game rules + seed algorithm version
  mode: "endless" | "daily",
  dailyDate: "YYYY-MM-DD" | null,
  board: 8x8 grid of 0..4 or null,
  score: number,
  moveCount: number,
  chainState: { ... },
  rng: { seed, cursor | state }, // needed so refills continue identically
  savedAt: number
}
```

Best score is stored separately from the in-progress game (see S16).

**Method.** Unit tests mock the storage layer so corrupt or failing reads and writes can be injected. A debug-only helper or a development build writes the same payloads on a real device. The helper must not exist in release builds.

## 2. Tests

### S01 — Save and restore a mid-run game
- **Steps:** Play 5 legal moves, force-quit, relaunch.
- **Expected:** Board, score, move count, chain state and RNG position equal the pre-quit values. The next move's refill columns equal those from an uninterrupted run with the same seed.

### S02 — Kill during a resolving move
- **Steps:** Start a move, kill the app at each phase: after tap, during removal, during gravity, during collapse, during refill, before score update.
- **Expected:** Relaunch gives either the full pre-move state or the full post-move state. Never a half-resolved board, a missing tile, or a score that disagrees with the board.

### S03 — Fully offline from first launch
- **Steps:** Install fresh, enable airplane mode before first launch, play to game over, restart, relaunch.
- **Expected:** No error dialogs, no hung network calls blocking the UI, best score saved, new run starts.

### S04 — Offline then online
- **Steps:** Play offline, regain network, relaunch.
- **Expected:** Local progress kept. Any sync is idempotent: a second sync of the same run creates no duplicate. A failed cloud request never erases a valid local save.

### S05 — Fresh install, empty storage
- **Expected:** New game starts, no crash, best score 0 (or the documented default).

### S06 — Invalid JSON
- **Payloads:** `""`, `"{"`, `"null"`, `"undefined"`, `"[object Object]"`, truncated valid JSON, binary garbage.
- **Expected:** App starts a new game, does not crash, the unreadable payload is preserved as a backup or quarantined (not silently discarded without a trace), and the event is logged.

### S07 — Valid JSON, wrong shape
- **Payloads:** missing `board`; `board: null`; `score: "100"`; `score: null`; extra unknown fields; arrays where objects are expected; `mode: "other"`.
- **Expected:** Rejected by validation with a safe fallback. Unknown extra fields do not break loading of a valid save.

### S08 — Wrong board dimensions
- **Payloads:** 7 rows, 9 rows, 8 rows where one has 7 or 9 cells, a flat array of 63 or 65 cells, nested depth wrong.
- **Expected:** Rejected.

### S09 — Invalid tile values and impossible boards
- **Payloads:** colour index 5, −1, `"R"`, `1.5`, `NaN`; empty cell below a filled cell in a column; a board that is entirely empty; a saved board that is already dead but not marked game over.
- **Expected:** Rejected, or repaired by a documented rule. A dead saved board is handled deterministically (game over shown, or new run started per product decision), never a stuck screen.

### S10 — Bad numeric values
- **Payloads:** `score: -1`, `NaN`, `Infinity`, `1e308`, a value above `Number.MAX_SAFE_INTEGER`; same for best score and move count.
- **Expected:** Rejected or clamped by a documented rule. Best score never decreases because of a bad value.

### S11 — Save from an older schema version
- **Steps:** Load fixtures for each previous `schemaVersion`.
- **Expected:** Migrated correctly or discarded explicitly by version number. Best score survives the migration.

### S12 — Save from a newer schema or ruleset version
- **Steps:** Load a save with a `schemaVersion` or `rulesetVersion` higher than the app knows.
- **Expected:** Not misread. Safe fallback without deleting the newer data (a downgrade must not destroy it).

### S13 — Interrupted write
- **Steps:** Simulate a write that stops halfway (truncated payload, throw after partial write).
- **Expected:** The last complete save is still loadable (write-then-swap, double slot, or checksum).

### S14 — Storage unavailable or full
- **Steps:** Make writes throw (full disk, permission failure).
- **Expected:** Play continues, the player is not blocked, error is logged, and the next successful write recovers.

### S15 — Rapid consecutive saves
- **Steps:** Trigger many saves in quick succession, including during animation and on backgrounding.
- **Expected:** Last write wins, no interleaved or mixed content, saves never block the UI thread during animations.

### S16 — Best score and settings isolated from the game save
- **Steps:** Corrupt or delete only the game save.
- **Expected:** Best score, sound, haptics and reduced-motion settings stay intact. Corrupting best score does not delete the game save either.

### S17 — Restored game behaves like a live one
- **Steps:** Restore a save, then play: legal moves, invalid taps, game over, restart.
- **Expected:** Game-over detection, valid-move detection, chain state and Daily seed behave exactly as in an uninterrupted run. A restored finished run does not offer extra moves.

## 3. Daily Challenge persistence (extra cases beyond the 17)

| ID | Case | Expected |
| --- | --- | --- |
| D01 | Resume today's Daily after relaunch | Same board sequence and result state |
| D02 | Saved Daily from a previous date | Handled per product decision (expired, completed state shown, or replayable); never silently mixed with today's seed |
| D03 | Device clock changed forward and back | No second or different Daily is granted by clock manipulation alone |
| D04 | Timezone change or travel across midnight | The challenge date matches the documented date rule (UTC vs local) |
| D05 | Daily completed offline, submitted later (if online features exist) | One submission, validated server-side, no duplicate |
| D06 | Ruleset version change after a Daily was started | Old Daily is replayable only under its original ruleset, or explicitly retired |

## 4. Result log (to be filled with real output only)

| Date | Commit | Command | Result |
| --- | --- | --- | --- |
| — | — | — | Not run: no persistence code exists yet |
