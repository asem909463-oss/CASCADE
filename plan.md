# CASCADE — implementation plan

## Product and architecture

Build a self-contained Expo / React Native / TypeScript iOS-first casual puzzle app. The game engine (`src/game/engine.ts`) owns board generation, group finding, scoring, gravity, column collapse, refill, stateful deterministic randomness, a versioned UTC-date seed and bounded cascade resolution as pure functions. React Native screens render and coordinate the engine; `src/storage/save.ts` validates versioned AsyncStorage records and a resumable run snapshot. Daily results are retained per challenge date. Haptics and brief original audio cues are local optional feedback. No Supabase or network dependency is added; backend ownership remains with Perplexity.

## Structure

- `App.tsx`: hydration gate, home, endless/daily flows, resumable runs, transition input guard, results and help/settings surfaces.
- `src/game/engine.ts`: pure 8×8 rules and deterministic seeding.
- `src/components/`: reusable board, tiles and action controls.
- `src/storage/save.ts`: resilient local save schema.
- `src/theme/tokens.ts`: original CASCADE design tokens.
- `src/__tests__/`: engine, seed, cascade and save-schema coverage.
- `assets/`: original application identity and short local audio effects.

## Design direction

Three low-probability directions considered: **Sun-warmed modernist playroom** (<0.08), **Neon arcade glass** (<0.07), and **Ink-and-coral field journal** (<0.06). Choose sun-warmed modernist playroom: premium tactility without arcade clutter, friendly but not childish.

- **Design Movement:** contemporary Japanese stationery meets restrained mid-century modern print.
- **Core Principles:** tactile tiles, generous breathing room, expressive typography, functional clarity.
- **Color Philosophy:** warm paper grounds the board; ink supplies legibility; coral anchors action; five softened jewel tones support quick sorting.
- **Layout Paradigm:** editorial vertical flow, floating score capsule, centered tactile board, low-profile bottom utility rail.
- **Signature Elements:** tiny tile-spark glyph, stitched board outline, coral score flare.
- **Interaction Philosophy:** one clean tap clears a group; subtle physical confirmation with optional haptics/audio; no gesture-only controls.
- **Animation:** changed-tile spring scale, layout transition and score/chain toast; respect Reduce Motion and guard input briefly during active transitions.
- **Typography System:** Georgia for select expressive headings; iOS system sans for controls/body; Menlo for compact numeric score figures.
- **Brand Essence:** “A little rhythm for your in-between moments”; clever, warm, composed.
- **Brand Voice:** compact, bright, never shouty. Examples: “Find your flow.” “One more lovely chain.”
- **Wordmark & Logo:** uppercase CASCADE wordmark paired with three descending rounded stones forming a falling trail.
- **Signature Brand Color:** CASCADE coral (`#F06B57`).

The deliverable is a source-code implementation on an isolated development branch; avoid backend integration or publication until separately coordinated.

## Proposed prototype values — require product approval before release

- Base score: 10 points per removed tile, with a five-point-per-tile bonus above group size four.
- Chain waves: multiplier increases with each wave; a seven-wave safety ceiling leaves any remaining group selectable.
- Daily progress marker: 10,000 points across the spec-approved 20 moves.
- Initial tile distribution: uniform over the five colours.

These defaults are named and tested structurally, but should be playtested and approved by the product owner. A real Xcode build, physical-iPhone QA, and independent Claude review remain release gates.
