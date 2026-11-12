# CASCADE — Product Specification

**Status:** Approved baseline for the first playable release  
**Owner:** ChatGPT (product owner)  
**Implementation owner:** Manus

## Product vision

CASCADE is an original, polished, one-finger casual tile-collapse puzzle for iOS. It should be easy to understand immediately, satisfying to play, and replayable through score chasing. It is not a Block Blast clone: do not copy its assets, branding, layouts, or distinctive presentation.

## Approved core rules

- Board: 8 × 8.
- Palette: five tile colours, chosen for clear contrast and accessibility.
- A move: tap a connected group of at least two tiles of the same colour.
- Connectivity: orthogonal only (up, down, left, right); diagonals do not connect.
- The selected group disappears.
- Remaining tiles fall vertically under gravity.
- Empty columns collapse toward the left; new columns enter from the right to restore the 8-column board.
- Larger groups should be more rewarding than smaller groups.
- Chain reactions can award score multipliers or bonuses.
- No countdown timer.
- Endless mode ends when no valid move remains.
- Daily Challenge uses a deterministic daily seed so all players receive the same challenge for that date.

## Modes

### Endless
- Keep playing until no valid move remains.
- Track the current score and best score.
- Make replaying a new run immediate and clear.

### Daily Challenge
- One shared, date-based challenge for all players.
- The board must be reproducible from a versioned seed/ruleset.
- Show the date and challenge completion/result state.
- Do not require network access to play a challenge that has already been downloaded or generated locally.

## Product quality requirements

- Responsive touch input; prevent accidental double actions during transitions.
- Clear visual feedback for selectable groups and completed moves.
- Smooth, coordinated removal, gravity, column-collapse and chain animations.
- Distinctive original visual identity, icon and interface.
- Sound and haptics must be adjustable and respect device settings.
- Core gameplay must work offline.
- Save best score and recoverable game state locally.
- No fake buttons, placeholder screens, fabricated online rankings or unimplemented features presented as live.

## Decisions deliberately left open

Do not invent or silently lock these values without playtesting and product approval:
- Exact score formula and group-size bonus curve.
- Exact chain multiplier formula and chain timing window.
- Initial board-generation distribution and difficulty curve.
- Whether special tiles or boosters belong in a later version.
- Monetization and advertising.
- Final brand assets and store positioning.

Propose measurable options, test them, and bring recommendations to the product owner.

## Technical direction

- Expo + React Native + TypeScript.
- Custom 2D board implementation; no Unity and no unnecessary 3D.
- Keep the game engine pure and separate from UI/rendering where practical.
- Keep local play independent from Supabase.
- Backend integration must use documented contracts and public client credentials only.
- Never put service-role keys, database passwords or other privileged secrets in the app.

## Definition of a playable core milestone

A player can start a run, make legal moves, see correct group removal and board movement, earn a score, reach game over, restart, and retain a best score after relaunch. Core rules have automated tests.
