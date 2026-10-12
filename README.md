# 알뜰 데이터

iOS Safari extension that saves mobile data. Text, links and buttons always load. Photos, video and fonts are blocked before download, and the user can tap to load them.

## Modes

Savings measured against the original page, iOS simulator, cold cache. Details in `test/savings-4sites.md`.

| Site | 절약 | 강력 | 글만 |
| --- | ---: | ---: | ---: |
| 네이버 뉴스 | 44% | 71% | 99% |
| 다음 뉴스 | 82% | 85% | 99.8% |
| 나무위키 | 42% | 48% | 93% |
| 유튜브 | 74% | 92% | 74%* |

\* YouTube needs JS, so 글만 falls back to 절약.

- **절약**: shows the main photo (low-res) and photos under the size limit; the rest become tap-to-load placeholders. Video waits for a tap.
- **강력**: every photo waits for a tap; fonts are blocked too.
- **글만**: only the HTML document is downloaded, shown in a reading layout. Pages that need JS switch to 절약 automatically.

The extension only acts on sites the user grants in Safari. Other sites load unchanged.

## Build

```sh
npm install
npm run build        # compiles src/*.ts into extension/*.js (required before Xcode)
open AltteulData/AltteulData.xcodeproj
```

Checks: `npm run test:cdn`. Test page with request log: `npm run test:serve`, then open `http://localhost:8080` in the simulator.

## Layout

- `src/` — extension TypeScript (background, content script, popup)
- `extension/` — manifest, popup HTML, icons; `*.js` is build output
- `AltteulData/` — iOS container app (onboarding, size limits) and the Safari extension target
- `test/` — local test page, measurement scripts and results
- `PRD.md` — product requirements
