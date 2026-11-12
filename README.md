# CASCADE

An original, offline-first Expo / React Native puzzle game. CASCADE is built around an 8×8 board, five tactile tile families, connected-group clears, gravity, column collapse, refill and scored chain reactions. Endless play and a versioned UTC-date daily puzzle share a pure TypeScript rules engine. Puzzle Journey adds a 500-stage, 10-chapter score-goal campaign with limited moves, persistent unlocks, best scores and up to three stars per level. An unfinished run can be resumed locally, including its seeded random sequence.

## Run locally

```sh
npm install
npm start
```

Open the project in Expo Go or a development build. For an iOS native build, use a Mac with Xcode or an authorized EAS Build environment. This repository is managed Expo: native `ios/` and `android/` folders are generated from `app.json` when needed.

## Checks

```sh
npm test
npm run typecheck
npx expo-doctor
```

Gameplay and local preferences work without a network connection. AsyncStorage stores completed-run records, date-keyed daily results, sound/haptics preferences, and a validated recoverable run snapshot. A ruleset-versioned seeded daily board is deterministic from the UTC date and displays that UTC challenge date. Reduce Motion disables tile and layout animations, and sound/haptics can be toggled independently. No backend or Supabase code is included; backend integration remains outside this client-owned scope.

The score curve, daily progress marker, uniform refill distribution and seven-wave chain safety ceiling are explicit implementation defaults and should be playtested before a balance-focused update. Privacy policy: [PRIVACY.md](./PRIVACY.md) and [privacy.html](./privacy.html). The repository CI checks TypeScript, engine/save tests, dependency advisories, and iOS and Android JavaScript bundle exports. A successful bundle export is not a substitute for native builds or physical-device QA.

## Project structure

- `App.tsx` — home, game, daily challenge, results, help, statistics and preferences.
- `src/game/engine.ts` — deterministic puzzle rules and scoring.
- `src/game/campaign.ts` — deterministic 500-level campaign definitions, seeded boards, score goals and star thresholds.
- `src/components/BoardGrid.tsx` — responsive, accessible tactile board.
- `src/storage/save.ts` — resilient, versioned local save model.
- `src/theme/tokens.ts` — CASCADE palette and tile language.
- `src/__tests__/engine.test.ts` — automated rules, seed, scoring and cascade regressions.
- `src/__tests__/save.test.ts` — storage migration, validation and resume-snapshot tests.
- `docs/` — approved product specification, ownership workflow and QA/release plan.
- `assets/` — custom app identity and original generated audio cues.
