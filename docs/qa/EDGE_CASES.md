# CASCADE — Additional Edge Cases (beyond the 30 + 17 tests)

**QA owner:** Claude
**Status:** Checklist for review and testing. **Nothing here has been run.**

Each case should become an automated test where the logic is pure, or a manual device check where it depends on the UI, OS or hardware.

## Engine and rules

| ID | Edge case | Expected |
| --- | --- | --- |
| E01 | Tap the same group twice in one frame | Only one removal happens |
| E02 | Tap a tile that is about to move because of an in-flight animation | Input uses the committed board state, not the animated position, or is blocked |
| E03 | Board with one remaining tile | Game over (no group of two possible), no exception |
| E04 | Board with tiles only in one column | Collapse and refill still produce 8 columns |
| E05 | All five colours form one big group touching all four edges | Whole group removed, no out-of-bounds |
| E06 | Long snake-shaped group visiting many cells | Flood fill is complete and does not overflow or recurse too deeply (use an iterative fill) |
| E07 | Two same-colour groups that become adjacent only after collapse | Treated as one group on the next move |
| E08 | Group removal that empties the left-most column | Collapse shifts everything and refills from the right |
| E09 | Refill produces a column identical to a neighbour | Allowed; any resulting group is detected |
| E10 | Refill yields a dead board | Behaviour matches the product decision (SPEC_REVIEW item 10) |
| E11 | Maximum possible score run | Stays within safe integer range; display does not truncate or overflow |
| E12 | Move count at very large values | No overflow, no UI layout break |
| E13 | Restart immediately after game over and during a move | Old animations cancelled; no stale callbacks mutate the new run |
| E14 | Double restart taps | One new run only |
| E15 | Ruleset version changes between app updates | Old saves and golden replays handled by version number |

## Random and Daily Challenge

| ID | Edge case | Expected |
| --- | --- | --- |
| E16 | Same seed on iOS device, simulator and Node test runtime | Identical board sequence (hash compared) |
| E17 | Seed derived from dates `2026-02-28`, `2026-02-29` (invalid), `2028-02-29`, year boundaries, DST change days | Valid dates map to distinct, stable seeds; invalid dates rejected |
| E18 | Midnight rollover while a Daily is in progress | Run finishes under the date it began on, or follows the documented rule |
| E19 | Device date set far in the past or future | No crash; challenge does not grant extra attempts without validation |
| E20 | Locale and calendar differences (non-Gregorian calendar, 12/24-hour clock, different digits) | Date string for the seed is always the same ISO form |
| E21 | Daily generated offline, then network returns | Same board; no re-download changes it |

## Persistence and lifecycle

| ID | Edge case | Expected |
| --- | --- | --- |
| E22 | App backgrounded in the middle of every animation phase | Foreground restores a consistent state; no double move |
| E23 | Phone call, Siri, notification banner, control centre during a move | No lost or duplicated input |
| E24 | Low storage, low memory warning, force quit by the OS | Save integrity kept; no crash loop on next launch |
| E25 | Upgrade install over an older build, delete and reinstall, restore from backup | Best score behaves as documented |
| E26 | Crash loop protection | If the save causes a crash twice, the app quarantines it and starts fresh |

## UI, input and accessibility

| ID | Edge case | Expected |
| --- | --- | --- |
| E27 | Highlighted group differs from the group that removes | Must never happen; highlight and removal use the same function |
| E28 | Two fingers on the board, or tap plus drag | Single action only |
| E29 | Tap exactly on a cell boundary or in the gap between tiles | Deterministic cell choice or no action |
| E30 | Reduce Motion on | Animations shortened or removed; score and state identical |
| E31 | Sound or haptics disabled, silent switch on, headphones unplugged mid-run | Settings respected; no crash if audio fails to load |
| E32 | Largest and smallest iPhone screens, notch/Dynamic Island, landscape if allowed | Board and controls fully visible and tappable (at least 44×44 pt targets) |
| E33 | Colour-blind simulation (protanopia, deuteranopia, tritanopia) | All five colours distinguishable, or non-colour cues provided |
| E34 | Dynamic Type at largest size, dark mode, VoiceOver | Score and controls still readable and operable, or limits documented |

## Performance and long sessions

| ID | Edge case | Expected |
| --- | --- | --- |
| E35 | Largest-group removal (64 tiles) animation on the oldest supported iPhone | No dropped input, no visible stutter beyond the agreed budget |
| E36 | 500+ moves in one Endless run | Memory flat, no timer or listener leaks |
| E37 | Rapid restart 100 times | No memory growth, no orphaned animation handles |
| E38 | Low Power Mode and thermal throttling | Game still completes animations and accepts input |

## Backend and sync (when Perplexity submits it)

| ID | Edge case | Expected |
| --- | --- | --- |
| E39 | Same score submitted twice, or replayed after reinstall | One record; duplicate rejected |
| E40 | Score for a date in the future or far past | Rejected server-side |
| E41 | Impossible score for a given seed and move list | Rejected, or risk explicitly accepted by product |
| E42 | 401, 403, 429, 500, timeout, and DNS failure on every call | App keeps playing; quiet retry; no crash |
| E43 | Two devices, one account, conflicting saves | Deterministic, documented resolution; no silent loss of a better result |
| E44 | Client bundle and git history scanned for secrets | No service-role key, database password or private token anywhere |
