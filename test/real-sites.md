# Real-site test set

Checked on the iOS 26 simulator (iPhone 17 Pro Max), preset "절약", 2026-10-12.

| Site | Page | Result | Status |
| --- | --- | --- | --- |
| 네이버 뉴스 | `n.news.naver.com/mnews/article/...` | Lazy images (`data-src`, inline `display:none`) vanished with no placeholder; only the caption remained | Fixed: lazy scan + main-image fallback. Main photo now loads |
| 네이버 뉴스 | same, "많이 본 뉴스" thumbnails | Grey boxes, no placeholder. Cause: `alt=""` linked thumbnails were classed as decoration; inline `onerror` swapped the img for a `<span>`; a link overlay swallowed taps; Naver navigates from document-level handlers | Fixed: linked `alt=""` = thumbnail, `onerror` stripped, placeholder fills the wrapper, taps captured at window level. MutationObserver added for later inserts |
| 네이버 뉴스 | header logo | Blank (CSS background sprite) | Accepted: PRD treats CSS backgrounds as decoration |
| 네이버 뉴스 | main photo | Loaded `?type=w860` (66KB) | Fixed: verified-size rewrite, now `?type=w480` (~30KB). Naver sizes below w480 return the full original, so they are never used |
| 다음 뉴스 | `v.daum.net/v/...` | Video player showed "알 수 없는 오류" | Fixed: known player iframes are blocked by DNR (`sub_frame`) and replaced by poster + load button; tap allows the frame and page media, then plays (verified with sound) |
| 클리앙 | `m.clien.net/service/board/park/...` | Attached image picked as main image and loaded | OK |
| All | any site without granted access | DNR still blocked, but there was no placeholder: native broken image + alt text only | Fixed: blocking is scoped to granted sites (`permissions.getAll()`); others load the original page |

Not a bug: Daum returns "페이지가 없어요" when a query string such as `?r=1` is appended to an article URL.

## Text-only mode ("글만") compatibility, 2026-10-12

| Site | Page | Result |
| --- | --- | --- |
| 네이버 뉴스 | article | Body present but buried in unstyled link lists; clean with 읽기 도구 |
| 다음 뉴스 | photo article | Body reads directly |
| 디시인사이드 | post | Body reads directly |
| 티스토리 | notice.tistory.com | Content present (server-rendered), long category list first |
| 나무위키 | 서울특별시 | Content present; inline SVG icons blew up to full width. Fixed with a minimal text-mode style |
| 네이버 블로그 | post list | Blank below the header (JS-loaded). Auto fallback to 절약 works |
| 11번가 | mobile home | Fully blank (SPA). Auto fallback to 절약 works |

Auto fallback: in 글만 mode, if the page shows fewer than 500 characters of text 1.5 s after load, the site is switched to 절약 permanently and reloaded, with a one-time notice.
