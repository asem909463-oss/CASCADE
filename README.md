# CASCADE

An original, offline-first Expo / React Native puzzle game. CASCADE is built around an 8×8 board, five tactile tile families, connected-group clears, gravity, column collapse, refill and scored chain reactions. Endless play and a versioned UTC-date daily puzzle share a pure TypeScript rules engine. An unfinished run can be resumed locally, including its seeded random sequence.

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

The score curve, 10,000-point daily progress marker, uniform refill distribution and seven-wave chain safety ceiling are implementation defaults for playtesting, not final product-approved balance. Do not treat this branch as release-ready until those values are approved and a native Xcode/physical-iPhone QA pass is completed.

## Project structure

- `App.tsx` — home, game, daily challenge, results, help, statistics and preferences.
- `src/game/engine.ts` — deterministic puzzle rules and scoring.
- `src/components/BoardGrid.tsx` — responsive, accessible tactile board.
- `src/storage/save.ts` — resilient, versioned local save model.
- `src/theme/tokens.ts` — CASCADE palette and tile language.
- `src/__tests__/engine.test.ts` — automated rules, seed, scoring and cascade regressions.
- `src/__tests__/save.test.ts` — storage migration, validation and resume-snapshot tests.
- `docs/` — approved product specification, ownership workflow and QA/release plan.
- `assets/` — custom app identity and original generated audio cues.
