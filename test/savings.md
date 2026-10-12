# Savings measurements

iOS 26 simulator, bytes received by Safari's WebKit networking process (`nettop`). Raw data: `savings-2026-10-12.csv`.

## Save vs off, cold cache (2026-10-12)

Each page was loaded with an empty cache and scrolled to the bottom over a 45 s window. Values are the mean of 2 runs.

| Page | Off | Save | Saved |
| --- | ---: | ---: | ---: |
| 네이버 기사 1 | 7.48MB | 1.21MB | 84% |
| 네이버 기사 2 | 9.86MB | 2.68MB | 73% |
| 네이버 뉴스 홈 | 2.70MB | 0.86MB | 68% |
| 다음 영상 기사 | 46.11MB | 4.77MB | 90% |
| 다음 사진 기사 | 10.38MB | 4.73MB | 54% |
| **네이버 total** | 20.04MB | 4.76MB | **76%** |
| **다음 total** | 56.49MB | 9.50MB | **83%** |

## What remains in save mode: 다음 사진 기사 (4.73MB)

Per-resource transfer sizes are unavailable: cross-origin `transferSize` is 0 for 68 of 69 entries. Instead, the page's own requests were re-fetched with `curl --compressed`:

| Resource | Size | Type |
| --- | ---: | --- |
| `newsview/.../page.css` | 1,625KB | site CSS |
| `newsview/.../page.js` | 1,259KB | site JS |
| `view-widget.js` | 777KB | site JS |
| `common.js` + `vendor.js` | 412KB | site JS |
| SF-UI-Display web fonts ×3 | 325KB | font (allowed in 절약) |
| Ad / analytics scripts (`ba`, `na`, kakao SDK) | ~160KB | JS |
| Article photo (`R440x0`) | 46KB | image |

About 87% of the remainder is the site's own JS and CSS. The PRD forbids blocking these, and they are cacheable.

Warm cache, save mode, other 다음 articles: 0.33MB on one article, 2.89MB on another (not analyzed).

## Text-only mode ("글만"), cold cache (2026-10-12)

"글만" blocks script, stylesheet, font, image, media and sub_frame, so only the HTML document arrives. Raw data: `savings-text-2026-10-12.csv`. Each value is the mean of 2 runs.

| Page | Off | Save | Text only |
| --- | ---: | ---: | ---: |
| 네이버 기사 1 | 7.48MB | 1.21MB (84%) | 0.05MB (99%) |
| 네이버 기사 2 | 9.86MB | 2.68MB (73%) | 0.06MB (99%) |
| 네이버 뉴스 홈 | 2.70MB | 0.86MB (68%) | 0.07MB (98%) |
| 다음 영상 기사 | 46.11MB | 4.77MB (90%) | 0.04MB (100%) |
| 다음 사진 기사 | 10.38MB | 4.73MB (54%) | 0.05MB (99%) |

Readability: pages render as unstyled HTML. The 다음 article body reads directly. On the 네이버 article the body sits among a lot of unstyled link lists, and Safari's 읽기 도구 shows it cleanly. The 네이버 home was not checked visually.
