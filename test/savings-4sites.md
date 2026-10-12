# Per-site savings baseline (2026-10-12)

iOS 26.5 simulator, Safari, bytes received by the WebKit networking process (`nettop`). Each run starts with an empty cache and no per-site overrides, loads the page, and scrolls to the bottom over a 45 s window. Values are the mean of 2 runs. Raw data: `savings-4sites-2026-10-12.csv`. Script: `measure-savings-4sites.sh` (needs the temporary harness described in its header).

Settings during the run: 모든 웹사이트 = 허용, photo auto-load limit = 100KB (app default), video/audio limit = 0.

| Site | Page | Off (original) | 절약 | 강력 | 글만 |
| --- | --- | ---: | ---: | ---: | ---: |
| 네이버 뉴스 | article 1 | 6.73MB | 3.20MB (52.5%) | 3.18MB (52.8%) | 55KB (99.2%) |
| 네이버 뉴스 | article 2 | 10.14MB | 4.90MB (51.7%) | 4.93MB (51.4%) | 62KB (99.4%) |
| 네이버 뉴스 | home | 3.97MB | 3.65MB (7.9%) | 3.99MB (-0.6%) | 57KB (98.6%) |
| 다음 뉴스 | video article | 45.29MB | 4.95MB (89.1%) | 4.40MB (90.3%) | 44KB (99.9%) |
| 다음 뉴스 | photo article | 9.64MB | 4.94MB (48.8%) | 4.35MB (54.8%) | 53KB (99.5%) |
| 나무위키 | 서울특별시 | 7.74MB | 4.49MB (42.0%) | 4.29MB (44.6%) | 624KB (91.9%) |
| 나무위키 | 대한민국 | 7.66MB | 4.47MB (41.6%) | 4.32MB (43.6%) | 430KB (94.4%) |
| 유튜브 | home* | 30.17MB | 27.49MB (8.9%) | 31.12MB (-3.2%) | 29.93MB (0.8%)† |
| 유튜브 | watch | 8.01MB | 6.75MB (15.8%) | 7.61MB (5.1%) | 8.27MB (-3.2%)† |

| Site | Off | 절약 | 강력 | 글만 |
| --- | ---: | ---: | ---: | ---: |
| 네이버 뉴스 | 20.85MB | 43.6% | 42.0% | 99.2% |
| 다음 뉴스 | 54.92MB | 82.0% | 84.1% | 99.8% |
| 나무위키 | 15.39MB | 41.8% | 44.1% | 93.2% |
| 유튜브 | 38.18MB | 10.3% | -1.4% | 0.0%† |

\* YouTube home "off" run 1 (1.44MB) was dropped: the page did not render (83 characters of text, 2 images), so only run 2 is used.
† YouTube is blank without its scripts, so 글만 falls back to 절약 automatically; the number is effectively 절약.

## Findings

1. **YouTube is not saved.** Video streams over `fetch` (MSE) from googlevideo.com, which DNR treats as `xmlhttprequest`, not `media`, so the media block never applies. Every mode loaded a video (`readyState > 0`).
2. **절약 on 네이버 dropped from 84% to 52%** compared with the morning run. The difference: the 100KB photo limit with 모든 웹사이트 = 허용 now auto-loads every verified thumbnail under 100KB. The 네이버 home is mostly thumbnails, so 절약 saves only 8% there.
3. **강력 is barely different from 절약** (blocks fonts on top), and on 네이버 home and YouTube it is slightly worse, within run-to-run noise.
4. **글만 holds at 92–99.9%** on every site that renders without JS. 나무위키 keeps 430–624KB because its HTML document itself is large.

## YouTube after the stream block (2026-10-12, later)

Change: on YouTube pages, 절약/강력/글만 block `googlevideo.com/videoplayback` (xmlhttprequest/media/other). A watch page shows "▶ 이 영상 보기"; tapping it allows that one video and reloads. Thumbnails (ytimg.com, ggpht.com) load in 절약 so videos can still be picked. Raw data: `savings-youtube-v2-2026-10-12.csv`, 2 runs each.

| Page | Off | 절약 before | 절약 now |
| --- | ---: | ---: | ---: |
| home | 34.32MB | 27.49MB (8.9%)* | 5.98MB (82.6%) |
| watch | 6.65MB | 6.75MB (15.8%)* | 4.90MB (26.4%) |
| **YouTube total** | 40.97MB | 10.3%* | **73.4%** |

\* Percentages from the earlier table (against its own off baseline).

글만 on YouTube still falls back to 절약 automatically (the page needs JS). Its measured numbers (1.9–2.1MB home, 1.6MB watch) predate a fix that gives fallback sites the thumbnails, so they are not reported as a separate result.

What remains on the watch page in 절약 (4.9MB over 45 s with scrolling): YouTube's own JS plus related-video thumbnails loaded while scrolling. The video itself costs about 160KB in 30 s without scrolling (measured separately).

## Three distinct tiers (2026-10-12, latest)

Change: 강력 now ignores the auto-load limits, so every photo waits for a tap (before, it saved only 1-3% more than 절약). Raw data: `savings-strong-v2-2026-10-12.csv`, 2 runs each. 절약 and 글만 values are from the runs above; YouTube uses the post-fix runs.

| Site | Original | 절약 | 강력 | 글만 |
| --- | ---: | ---: | ---: | ---: |
| 네이버 뉴스 | 20.85MB | 43.6% | **71.3%** | 99.2% |
| 다음 뉴스 | 54.92MB | 82.0% | **85.1%** | 99.8% |
| 나무위키 | 15.39MB | 41.8% | **48.2%** | 93.2% |
| 유튜브 | 40.98MB | 73.5% | **92.0%** | = 절약 (falls back) |

| Page | Original | 절약 | 강력 |
| --- | ---: | ---: | ---: |
| 네이버 article 1 | 6.73MB | 3.20MB (52.5%) | 1.34MB (80.1%) |
| 네이버 article 2 | 10.14MB | 4.90MB (51.7%) | 3.21MB (68.4%) |
| 네이버 home | 3.97MB | 3.65MB (7.9%) | 1.44MB (63.6%) |
| 다음 video article | 45.29MB | 4.95MB (89.1%) | 4.28MB (90.5%) |
| 다음 photo article | 9.64MB | 4.94MB (48.8%) | 3.93MB (59.2%) |
| 나무위키 서울특별시 | 7.74MB | 4.49MB (42.0%) | 4.20MB (45.7%) |
| 나무위키 대한민국 | 7.66MB | 4.47MB (41.6%) | 3.77MB (50.7%) |
| 유튜브 home | 34.32MB | 5.98MB (82.6%) | 1.79MB (94.8%) |
| 유튜브 watch | 6.65MB | 4.90MB (26.4%) | 1.51MB (77.3%) |

On 다음 and 나무위키 the gap between 절약 and 강력 is small because what remains is the sites' own JS/CSS, which only 글만 removes.
