# Mobile web

Patrol supports the same campaign on phones, tablets, and desktop windows.
Game rules, verified setups, scores, hint quotas, and saved-progress schemas are
unchanged.

## Controls

On phones, the large moves counter stays centered at the top with More at the
right. The logo/country bar and +/− zoom controls are hidden. Pan and pinch the
map to inspect borders. Find fugitive, Country view, the Posts list, and the
Your move indicator have been removed.

The mobile squad picker opens only after a post is selected. Clear closes it;
sending a squad collapses it to the journey strip until movement finishes. Hint
rests near the bottom, rises above the picker while it is open, and moves down
when it closes. Short landscape screens use a single row of squad cards.
Desktop retains the persistent squad dock. More contains Case file, How to play,
Restart, Previous hunt, and best score.

`src/viewport.ts` maintains visible-viewport CSS variables and measures controls
for camera framing. `src/game/map-viewport.ts` chooses an unobscured map area;
its tests cover portrait panels, landscape obstructions, and tiny/offset views.
Camera layout reads happen on input/layout changes, rather than in the movement
frame loop. MapLibre markers remain in their own stacking context beneath panels.
Interface tuning lives in `src/game/playtest.config.ts`.

Tutorials, case files, capture results, the newspaper editor, and survey panels
have bounded scrolling. The newspaper keeps header/footer controls outside its
scrolling body and preserves 1200 × 1500 PNG output. Crop updates coalesce per
animation frame; PNG encoding prepares the current image before Share is enabled.
The original PostHog survey host and SDK handlers are preserved in a coordinated
native dialog, queued behind case/help/newspaper overlays. Survey keyboard input
cannot trigger game shortcuts.

## Reproduce browser checks

Run `npm run dev` separately, then use an isolated Playwright CLI session:

```sh
npx --yes --package @playwright/cli playwright-cli -s=patrol-mobile open http://localhost:3000/patrol/ --headed
npx --yes --package @playwright/cli playwright-cli -s=patrol-mobile run-code --filename=scripts/check-mobile.js
npx --yes --package @playwright/cli playwright-cli -s=patrol-mobile run-code --filename=scripts/check-survey.js
npx --yes --package @playwright/cli playwright-cli -s=patrol-mobile run-code --filename=scripts/check-newspaper.js
npx --yes --package @playwright/cli playwright-cli -s=patrol-mobile close
```

Each callback creates and closes a fresh browser context, preserving existing
browser storage. Newspaper tests generate a nonpersonal image and mock native
sharing. Survey fixtures submit no responses. Development telemetry remains off.
Screenshots/results are generated under ignored `output/playwright/`.

The responsive matrix covers 320 × 568, 390 × 844, 568 × 320, 844 × 390,
768 × 1024, 1024 × 768, and 1440 × 900. It checks direct map selection,
picker/Hint transitions, guided capture, rotation during movement, refreshed
movement, hints, all five help slides, dialogs, and all three countries.
Newspaper checks cover cropping, latest-image export, user activation, cancelled
sharing, download/copy fallback, and stale encoding during close/reopen.

## Verification limits

Browser checks use Chromium touch emulation. Physical iPhone Safari/Android
Chrome, native share destinations, software keyboards, and device CPU/memory
remain unverified. The existing owner-style Sea labels warning and Vite large
chunk advisory remain; neither prevented the local checks or production build.

## Recorded verification — 2026-10-19

- `npm test`: 92 passed; `npm run build` and `git diff --check` passed.
- Chromium callbacks: 39 mobile/gameplay checks, 11 survey checks, and 10
  newspaper checks passed. No page errors were recorded. Survey fixtures sent
  zero responses; native sharing was mocked.
- Review findings fixed: hidden-menu focus restoration, focus when the picker
  closes, map markers painting over panels, and native result dialogs hiding
  PostHog feedback or allowing survey typing to activate game shortcuts.

A single desktop Chromium comparison used the original `b520a6a` checkout and
this implementation at 1440 × 900, with India's opening move reset before each
sample. Cold/warm here means browser network caching disabled/enabled during
reload; readiness waits for verified game data, not all basemap tiles.

| Measurement | Original | Mobile implementation |
| --- | ---: | ---: |
| Cache-disabled reload to game ready | 323 ms | 350 ms |
| Cache-enabled reload to game ready | 313 ms | 294 ms |
| Opening move wall time | 2,297 ms | 2,301 ms |
| Median / p95 frame interval | 8.3 / 9.3 ms | 8.3 / 9.1 ms |
| Maximum frame interval | 24.9 ms | 25.0 ms |
| Browser task CPU in sample | 485.7 ms | 668.3 ms |
| End-of-sample JS heap | 69.9 MiB | 57.7 MiB |

The CPU sample was higher while frame pacing remained similar. Tile preparation,
map framing, and garbage collection were not isolated; these single samples do
not establish CPU or retained-memory equivalence or an improvement. They are
local desktop observations, not phone performance acceptance evidence.
