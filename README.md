# CASCADE

A polished, one-finger tile-collapse puzzle for iOS, built with Expo, React Native and TypeScript.

## Current milestone

The first playable core is under active development on `build/playable-core`.

Included:
- 8×8 board and five-color tile palette
- Orthogonal groups of two or more
- Group removal, vertical gravity, left column collapse and right-side refill
- Provisional group-size scoring
- Game-over detection and restart
- Local personal-best and resumable game-state persistence with corrupt-save validation
- Haptic feedback
- Initial deterministic game-engine tests

Not yet implemented: chain-reaction rules, Daily Challenge UI/seed schedule, cloud saves, sound controls, final animations, backend/leaderboards, onboarding and store assets.

## Run locally

```bash
npm install
npx expo start
```

Scan the QR code with Expo Go to run on a device.

## Validate (also runs in GitHub Actions on pushes and pull requests)



```bash
npm run typecheck
npm test
npx expo export --platform ios --output-dir dist
```

## Project structure

- `App.tsx` — first playable screen
- `src/game/engine.ts` — pure board rules and scoring
- `src/game/engine.test.ts` — deterministic engine tests
- `src/storage/save.ts` — local best-score persistence
- `docs/PRODUCT_SPEC.md` — approved product baseline
- `docs/QA_PLAN.md` — QA and release test plan

The score curve is a tunable prototype value and is not yet product-approved. No test or build is considered passed until its output has been checked.
