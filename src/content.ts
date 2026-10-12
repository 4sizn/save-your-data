// Every image is blocked by DNR. The main image is allowed at low res; the rest get a tap-to-load placeholder.
// Lazy-load libraries park the real URL here and leave src empty or a data: stub.
const LAZY_ATTRS = ["data-src", "data-lazy-src", "data-original"];

// F1/F5: the site's own preset wins over the global one. Same defaults as background.ts.
// View: "keep" leaves a placeholder in the layout; "hide" collapses blocked media (display only, same savings).
let hideMode = false;
// Text mode: only the HTML arrives. Media collapses (like hide mode) and nothing loads on its own.
let textMode = false;
// 강력: every photo waits for a tap, whatever the size limit (otherwise it saved only 1-3% more than 절약).
let strongMode = false;
const preset: Promise<"off" | "save" | "strong" | "text"> = chrome.storage.local
  .get(["preset", "sites", "view"])
  .then((s) => {
    const { preset = "save", sites = {}, view } = s as {
      preset?: "off" | "save" | "strong" | "text";
      sites?: Record<string, "off" | "save" | "strong" | "text">;
      view?: "keep" | "hide";
    };
    const p = sites[location.hostname] ?? preset;
    textMode = p === "text";
    strongMode = p === "strong";
    hideMode = view === "hide" || textMode;
    if (textMode) {
      revealNoscript();
      addTextModeStyle();
      readTextPage();
    }
    return p;
  });

// Text mode blocks the site's scripts, but JS is still on, so <noscript> fallbacks (often the real
// content or nav) stay hidden. Show their contents instead.
function revealNoscript(): void {
  const run = () =>
    document.querySelectorAll("noscript").forEach((ns) => {
      const box = document.createElement("div");
      box.innerHTML = ns.textContent ?? "";
      ns.replaceWith(box);
    });
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", run, { once: true });
  else run();
}

// Text mode has no site CSS (blocked), so the extension styles the page itself for reading: typography,
// width, dark mode, and site chrome (nav, footer, dead buttons) folded away. Shipped in the extension, so
// it costs no download.
const TEXT_MODE_CSS = `
:root{color-scheme:light dark}
html{background:#fff!important;color:#1c1c1e!important}
body{max-width:40em;margin:0 auto!important;padding:20px 20px 96px!important;background:transparent!important;
  font:18px/1.75 -apple-system,system-ui,sans-serif!important;word-break:keep-all;overflow-wrap:anywhere}
h1,h2,h3{line-height:1.35!important;font-weight:700!important;margin:1.2em 0 .5em!important}
h1{font-size:1.6em!important}h2{font-size:1.35em!important}h3{font-size:1.15em!important}
p{margin:0 0 1em!important}
a{color:#0a66c2!important;text-decoration:none!important}
ul,ol{padding-left:1.2em!important}
figcaption,small{color:#6c6c70!important;font-size:.88em!important}
blockquote{margin:1em 0!important;padding-left:1em!important;border-left:3px solid #d1d1d6!important;color:#3a3a3c!important}
img,video,iframe{max-width:100%!important;height:auto!important}
table{display:block;max-width:100%;overflow-x:auto;border-collapse:collapse}
td,th{padding:4px 8px;border:1px solid #d1d1d6}
svg{max-width:1.2em!important;max-height:1.2em!important}
nav,footer,aside,form,button,input,select,textarea,[role=navigation],[role=contentinfo],[role=complementary],
[role=search],[hidden],[aria-hidden=true]{display:none!important}
@media (prefers-color-scheme:dark){
  html{background:#000!important;color:#e5e5ea!important}
  a{color:#4da3ff!important}figcaption,small{color:#98989f!important}
  blockquote{border-color:#48484a!important;color:#c7c7cc!important}td,th{border-color:#48484a}}`;

function addTextModeStyle(): void {
  const style = document.createElement("style");
  style.textContent = TEXT_MODE_CSS;
  (document.head ?? document.documentElement).append(style);
}

// Readability-lite: every paragraph-sized text node adds its length to its ancestors, decaying with
// distance (1, 1/2, ... up to 5 levels), so a body split over many deep paragraphs outscores one long
// comment. Link text, chrome, and comment/reply sections don't count.
// ponytail: classic heuristic, no per-site rules; the "전체 페이지 보기" link covers misses.
const NOT_BODY = "a, nav, footer, aside, script, style, noscript, button, form";
const COMMENTS = /comment|reply|cmt|댓글/i;

function findArticle(): HTMLElement | null {
  const scores = new Map<HTMLElement, number>();
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  for (let n = walker.nextNode(); n; n = walker.nextNode()) {
    const len = n.textContent?.trim().length ?? 0;
    const parent = n.parentElement;
    if (len < 10 || !parent || parent.closest(NOT_BODY)) continue;
    let e: HTMLElement | null = parent;
    for (let level = 1; e && e !== document.body && level <= 5; level++, e = e.parentElement) {
      if (COMMENTS.test(`${e.id} ${e.className}`)) break;
      scores.set(e, (scores.get(e) ?? 0) + len / level);
    }
  }
  for (const el of scores.keys()) if (COMMENTS.test(`${el.id} ${el.className}`) || el.closest("[class*=comment],[id*=comment],[class*=reply],[class*=cmt]")) scores.delete(el);
  let best: HTMLElement | null = null;
  let top = 0;
  for (const [el, score] of scores) if (score > top) [best, top] = [el, score];
  return top >= 120 ? best : null; // too little prose: leave the page whole
}

// The headline usually sits outside the body container, and section labels ("인물") are headings too. The
// page's own og:title is the reliable name: keep the heading that matches it, or add one from it.
function findTitle(article: HTMLElement): HTMLElement | null {
  const want = (document.querySelector<HTMLMetaElement>('meta[property="og:title"]')?.content || document.title).trim();
  if (!want) return null;
  const key = want.slice(0, 12);
  for (const h of document.querySelectorAll<HTMLElement>("h1, h2, h3")) {
    const text = h.textContent?.trim() ?? "";
    if (text.length >= 6 && !article.contains(h) && (want.includes(text) || text.includes(key))) return h;
  }
  const h1 = document.createElement("h1");
  h1.textContent = want;
  article.before(h1);
  return h1;
}

// Fold everything except the title and body (and the elements on the path to them). Hidden, not removed.
function focusArticle(): void {
  const article = findArticle();
  if (!article) return;
  const keep = [article, findTitle(article)].filter((e): e is HTMLElement => !!e);
  const path = new Set<Element>();
  for (const k of keep) for (let e: Element | null = k; e && e !== document.body; e = e.parentElement) path.add(e);
  const restore: (() => void)[] = [];
  for (const e of path)
    for (const sib of e.parentElement?.children ?? [])
      if (!path.has(sib) && sib instanceof HTMLElement && !sib.matches("script, style")) restore.push(hide(sib));

  const line = lineButton("전체 페이지 보기", keep[0]);
  onTap(line.button, () => {
    restore.forEach((r) => r());
    line.host.remove();
  });
  document.body.prepend(line.host);
}

// Pages that build their content with JS come out (nearly) empty without scripts. Then switch this site to
// save mode for good and reload, and say so once on the reloaded page. With scripts blocked the DOM is
// final at DOMContentLoaded, so the check runs right away instead of waiting for load.
// ponytail: fixed text-length threshold; per-site learning (PRD F11) if it misjudges real pages.
const FALLBACK_NOTE = "altteul-fallback";
const MIN_TEXT = 500;

function readTextPage(): void {
  const run = () => {
    if ((document.body?.innerText.trim().length ?? 0) >= MIN_TEXT) return focusArticle();
    chrome.runtime
      .sendMessage({ type: "setSettings", host: location.hostname, sitePreset: "save" })
      .then((res) => {
        if (!res?.ok) return;
        try {
          sessionStorage.setItem(FALLBACK_NOTE, "1");
        } catch {}
        location.reload();
      })
      .catch((e) => console.warn("[altteul]", e));
  };
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", run, { once: true });
  else run();
}

function showFallbackNote(): void {
  try {
    if (!sessionStorage.getItem(FALLBACK_NOTE)) return;
    sessionStorage.removeItem(FALLBACK_NOTE);
  } catch {
    return;
  }
  const host = document.createElement("div");
  host.style.cssText = "position:fixed;left:16px;right:16px;top:12px;z-index:2147483647";
  host.attachShadow({ mode: "open" }).innerHTML =
    `<style>div{padding:10px 14px;border-radius:12px;background:#1c1c1e;color:#fff;font:14px/1.4 -apple-system,system-ui,sans-serif;box-shadow:0 4px 16px rgb(0 0 0/.25)}</style>` +
    `<div role="status">이 사이트는 글만 모드로 보기 어려워서 절약 모드로 바꿨어요.</div>`;
  document.body.append(host);
  setTimeout(() => host.remove(), 4000);
}

// Hide mode: the outermost ancestor that holds nothing but this media (thumbnail frame, figure without
// caption), so the collapse doesn't leave an empty box. Hidden, never removed: site scripts keep their nodes.
// A box whose other children are all overlays (absolute badges like "1위") only exists to size the media,
// so it goes too; the overlay text is lost with it.
const outOfFlow = (e: Element) => ["absolute", "fixed"].includes(getComputedStyle(e).position);

function mediaFrame(el: HTMLElement): HTMLElement {
  let frame = el;
  for (let p = el.parentElement; p && p !== document.body; p = p.parentElement) {
    if (p.querySelectorAll("img, video, audio, iframe").length > 1) break;
    const onlyMedia = !p.textContent?.trim() || [...p.children].every((c) => c === frame || outOfFlow(c));
    if (!onlyMedia) break;
    frame = p;
  }
  return frame;
}

const hide = (el: HTMLElement) => {
  const prev = el.style.getPropertyValue("display");
  el.style.setProperty("display", "none", "important");
  return () => (prev ? el.style.setProperty("display", prev) : el.style.removeProperty("display"));
};

// Hide mode keeps the image's own description as one tappable line. Link text is skipped: for list
// thumbnails it is the title already shown next to the image.
const ownLabel = (img: HTMLImageElement) =>
  img.alt.trim() || img.title.trim() || img.getAttribute("aria-label")?.trim() || "";

// anchor: the box the line replaces. Full-bleed boxes (edge to edge) get the usual 16px mobile gutter.
// Call before hiding the anchor: a hidden box has no position.
function lineButton(text: string, anchor: HTMLElement): { host: HTMLElement; button: HTMLButtonElement } {
  const host = document.createElement("span");
  host.style.cssText = `display:block;margin:2px 0;${anchor.getBoundingClientRect().left < 4 ? "padding:0 16px" : ""}`;
  const root = host.attachShadow({ mode: "open" });
  root.innerHTML =
    `<style>button{all:unset;cursor:pointer;color:#007aff;font:14px/1.4 -apple-system,system-ui,sans-serif}` +
    `@media (prefers-color-scheme:dark){button{color:#0a84ff}}</style><button type="button"></button>`;
  const button = root.querySelector("button")!;
  button.textContent = text;
  return { host, button };
}

const PLACEHOLDER_CSS = `
.box{box-sizing:border-box;width:100%;height:100%;min-height:96px;display:flex;flex-direction:column;
  align-items:center;justify-content:center;gap:8px;padding:8px;border:1px dashed #aeaeb2;border-radius:8px;
  background:#f2f2f7;color:#3a3a3c;font:14px/1.4 -apple-system,system-ui,sans-serif;text-align:center;overflow:hidden}
.label{display:-webkit-box;-webkit-line-clamp:3;-webkit-box-orient:vertical;overflow:hidden}
button{font:inherit;padding:6px 14px;border:0;border-radius:999px;background:#007aff;color:#fff}
@media (prefers-color-scheme:dark){.box{background:#1c1c1e;color:#e5e5ea;border-color:#636366}button{background:#0a84ff}}`;

// Our buttons sit inside page links, and sites like Naver navigate from their own document-level
// handlers, which run before a button's own listener could stop them. A window capture listener
// registered at document_start runs before any page listener, so taps on our buttons end here.
// Touch/pointer events are only stopped, never cancelled, so the browser still synthesizes the click.
const tapActions = new WeakMap<Element, () => void>();
const onTap = (button: Element, action: () => void) => tapActions.set(button, action);
for (const type of ["click", "touchstart", "touchend", "pointerdown", "pointerup", "mousedown", "mouseup"]) {
  window.addEventListener(
    type,
    (e) => {
      const button = e.composedPath().find((el) => el instanceof Element && tapActions.has(el)) as Element | undefined;
      if (!button) return;
      e.stopImmediatePropagation();
      if (e.type !== "click") return;
      e.preventDefault(); // don't follow a wrapping link
      tapActions.get(button)!();
    },
    true,
  );
}

// Blocked images currently replaced by a placeholder, with the page's own inline display to restore.
const placeholders = new WeakMap<HTMLImageElement, { host: HTMLElement | null; display: string; unhide?: () => void }>();
// Images we re-requested; their transient errors must not spawn a placeholder.
const loading = new WeakSet<HTMLImageElement>();

function imageArea(img: HTMLImageElement): number {
  const w = Number(img.getAttribute("width"));
  const h = Number(img.getAttribute("height"));
  if (w && h) return w * h;
  const rect = (placeholders.get(img)?.host ?? img).getBoundingClientRect();
  return rect.width * rect.height;
}

// Icon-sized images (logos, avatars, badges) and alt="" images are decoration: no placeholder, never the
// main image. Exception: alt="" inside a link is a list thumbnail whose text sits next to it (PRD: 보조).
function isDecorative(img: HTMLImageElement): boolean {
  const w = Number(img.getAttribute("width"));
  const h = Number(img.getAttribute("height"));
  if (w > 0 && h > 0 && w <= 48 && h <= 48) return true;
  return img.getAttribute("alt") === "" && !img.closest("a[href]");
}

function lazyUrl(img: HTMLImageElement): string | null {
  for (const a of LAZY_ATTRS) {
    const v = img.getAttribute(a);
    if (v) return v;
  }
  return null;
}

// ponytail: largest image in the article wins, else the first one (hidden lazy images have no size yet).
// Full 3-tier classification comes later in M1.
function pickMainImage(): HTMLImageElement | null {
  const root = document.querySelector("article") ?? document.querySelector("main, [role=main]") ?? document.body;
  const candidates = [...root.querySelectorAll("img")].filter((img) => !isDecorative(img));
  let best: HTMLImageElement | null = null;
  let bestArea = 0;
  for (const img of candidates) {
    const area = imageArea(img);
    if (area > bestArea) [best, bestArea] = [img, area];
  }
  return best ?? candidates[0] ?? null;
}

// F3 for CDNs without srcset: rewrite the size parameter, only ever downward, and only to sizes
// verified to return a resized image (2026-10-12). Unlisted CDNs keep their URL.
// Naver: type=w480|w540|w647|w800|w860 resize; w440 and below return the full original (often bigger).
const NAVER_WIDTHS = [480, 540, 647, 800, 860];

function cdnResize(raw: string, target: number): string {
  const url = new URL(raw);
  if (url.hostname.endsWith(".pstatic.net")) {
    const cur = Number(url.searchParams.get("type")?.match(/^w(\d+)$/)?.[1]);
    const want = NAVER_WIDTHS.find((w) => w >= target) ?? NAVER_WIDTHS.at(-1)!;
    if (cur && want < cur) url.searchParams.set("type", `w${want}`);
    return url.href;
  }
  // Daum: /thumb/<op><w>x<h>[.q80]/?fname=... ; R<w>x0 keeps the aspect ratio at any width.
  if (url.hostname.endsWith(".daumcdn.net")) {
    const m = url.pathname.match(/^\/thumb\/[A-Z](\d+)x\d+[^/]*\//);
    const w = Math.ceil(target);
    if (m && Number(m[1]) > w) url.pathname = url.pathname.replace(m[0], `/thumb/R${w}x0/`);
    return url.href;
  }
  return raw;
}

// F3: smallest srcset candidate at least as wide as the display width (capped at screen width, 1x).
function lowResUrl(img: HTMLImageElement): string | null {
  const shown = placeholders.get(img)?.host?.clientWidth || img.clientWidth;
  const target = Math.min(shown || Number(img.getAttribute("width")) || innerWidth, innerWidth);
  const candidates = [...(img.getAttribute("srcset") ?? "").matchAll(/([^\s,]+)\s+(\d+)w/g)]
    .map((m) => ({ url: m[1], w: Number(m[2]) }))
    .sort((a, b) => a.w - b.w);
  const pick = candidates.find((c) => c.w >= target) ?? candidates.at(-1);
  const src = img.getAttribute("src");
  const raw = pick?.url ?? (src && !src.startsWith("data:") ? src : lazyUrl(img) ?? src);
  return raw ? cdnResize(new URL(raw, document.baseURI).href, target) : null;
}

// Real size (HEAD) and the user's auto-load limit for this kind. size is null when the server can't be asked.
type SizeInfo = { size: number | null; limit: number };
const sizeInfo = (url: string, kind: "image" | "video" | "audio"): Promise<SizeInfo> =>
  chrome.runtime.sendMessage({ type: "size", url, kind }).catch(() => ({ size: null, limit: 0 }));
// Only verified sizes count: unknown size never auto-loads.
const withinLimit = ({ size, limit }: SizeInfo) =>
  !strongMode && !textMode && size !== null && limit > 0 && size <= limit;

const formatSize = (n: number) => (n < 1024 * 1024 ? `${Math.max(1, Math.round(n / 1024))}KB` : `${(n / 1048576).toFixed(1)}MB`);

function describe(img: HTMLImageElement): string {
  return (
    img.alt ||
    img.title ||
    img.getAttribute("aria-label") ||
    img.closest("figure")?.querySelector("figcaption")?.textContent?.trim() ||
    img.closest("a[href]")?.textContent?.trim().replace(/\s+/g, " ") ||
    ""
  );
}

async function allow(url: string, kind: "image" | "media", prefix = false): Promise<void> {
  const res = await chrome.runtime.sendMessage({ type: "allow", url, kind, prefix });
  if (!res?.ok) throw new Error(`allow failed: ${res?.error}`);
}

async function loadImage(img: HTMLImageElement): Promise<void> {
  const url = lowResUrl(img);
  if (!url) return;
  loading.add(img);
  try {
    await allow(url, "image");
  } catch (e) {
    loading.delete(img);
    throw e;
  }
  const ph = placeholders.get(img);
  if (ph) {
    // A site's error handler may have swapped the img out of the DOM; put it back where the placeholder is.
    if (!img.isConnected && ph.host?.isConnected) ph.host.replaceWith(img);
    else ph.host?.remove();
    ph.unhide?.();
    img.style.display = ph.display;
    placeholders.delete(img);
  }
  img.addEventListener("load", () => loading.delete(img), { once: true });
  img.closest("picture")?.querySelectorAll("source").forEach((s) => s.remove());
  img.removeAttribute("srcset");
  img.removeAttribute("sizes");
  img.removeAttribute("src"); // force a fresh request after the blocked attempt
  img.src = url;
  // Lazy loaders keep images hidden (display, visibility or opacity) until their own loader succeeds,
  // which never happens here.
  const cs = getComputedStyle(img);
  if (cs.display === "none") img.style.setProperty("display", "revert", "important");
  if (cs.visibility === "hidden") img.style.setProperty("visibility", "visible", "important");
  if (cs.opacity === "0") img.style.setProperty("opacity", "1", "important");
}

// F4: keep the layout box, show alt/caption, and load just this image on tap. Links around it keep working.
function hideImage(img: HTMLImageElement): void {
  img.removeAttribute("onerror"); // see showPlaceholder
  const display = img.style.display;
  const frame = mediaFrame(img);
  const label = ownLabel(img);
  const line = label ? lineButton(`사진 · ${label}`, frame) : null;
  const unhideImg = hide(img);
  const unhideFrame = frame !== img ? hide(frame) : () => {};
  let host: HTMLElement | null = null;
  if (line) {
    host = line.host;
    line.button.setAttribute("aria-label", `사진 불러오기: ${label}`);
    onTap(line.button, () => loadImage(img).catch((err) => console.warn("[altteul]", err)));
    frame.before(host);
  }
  placeholders.set(img, { host, display, unhide: () => (unhideFrame(), unhideImg()) });
  const url = lowResUrl(img);
  if (url && !textMode)
    sizeInfo(url, "image").then((info) => {
      if (withinLimit(info)) loadImage(img).catch((err) => console.warn("[altteul]", err));
    });
}

function showPlaceholder(img: HTMLImageElement): void {
  if (placeholders.has(img) || loading.has(img) || isDecorative(img)) return;
  if (hideMode) return hideImage(img);
  const rect = img.getBoundingClientRect();
  const w = Number(img.getAttribute("width")) || rect.width;
  const h = Number(img.getAttribute("height")) || rect.height;
  const host = document.createElement("span");
  const parent = img.parentElement;
  // Hidden lazy images have no box; their wrapper usually reserves the ratio (padding hack, img absolutely
  // positioned). Fill that wrapper instead of stacking a second box next to it.
  const fillParent =
    !rect.width && !Number(img.getAttribute("width")) && parent && getComputedStyle(parent).position !== "static" && parent.clientHeight > 0;
  host.style.cssText = fillParent
    ? "position:absolute;inset:0;display:block;z-index:2" // above the site's thumbnail overlay, below sticky headers
    : `display:inline-block;vertical-align:top;max-width:100%;width:${w ? `${w}px` : "100%"};` +
      (w && h ? `aspect-ratio:${w}/${h};` : "");
  const root = host.attachShadow({ mode: "open" });
  // Logo/avatar-sized boxes can't fit the label and a long button: show a short button only.
  const small = (rect.width || w) > 0 && (rect.width || w) < 140;
  const tapText = small ? "불러오기" : "탭해서 불러오기";
  root.innerHTML =
    `<style>${PLACEHOLDER_CSS}.small{min-height:0;padding:2px}.small .label{display:none}.small button{padding:4px 8px;font-size:12px}</style>` +
    `<div class="box${small ? " small" : ""}"><span class="label"></span><button type="button">${tapText}</button></div>`;
  const label = describe(img);
  root.querySelector(".label")!.textContent = label || "이미지";
  const button = root.querySelector("button")!;
  button.setAttribute("aria-label", label ? `이미지 불러오기: ${label}` : "이미지 불러오기");
  const url = lowResUrl(img);
  if (url) {
    sizeInfo(url, "image").then((info) => {
      if (withinLimit(info)) return loadImage(img).catch((err) => console.warn("[altteul]", err));
      if (!info.size) return;
      button.textContent = small ? formatSize(info.size) : `${tapText} · ${formatSize(info.size)}`;
      button.setAttribute("aria-label", `${button.getAttribute("aria-label")}, ${formatSize(info.size)}`);
    });
  }
  onTap(button, () => loadImage(img).catch((err) => console.warn("[altteul]", err)));
  // Inline handlers like onerror="this.outerHTML='<span class=noimage>'" would detach the img on the
  // blocked load and leave nothing to load later.
  img.removeAttribute("onerror");
  placeholders.set(img, { host, display: img.style.display });
  img.style.setProperty("display", "none", "important");
  img.before(host);
}

// Blocked requests surface as image errors; errors don't bubble, so listen in the capture phase.
// This also covers lazy-loaded and script-inserted images and media without a MutationObserver.
document.addEventListener(
  "error",
  (e) => {
    const t = e.target;
    preset.then((p) => {
      if (p === "off") return; // nothing is blocked; leave genuine load errors alone
      if (t instanceof HTMLImageElement) showPlaceholder(t);
      else if (t instanceof HTMLMediaElement) parkMedia(t);
      else if (t instanceof HTMLSourceElement && t.parentElement instanceof HTMLMediaElement) parkMedia(t.parentElement);
    });
  },
  true,
);

// F6: media is blocked by DNR. iOS fetches even with preload=none, so a blocked video sits in an error
// state that hides its poster. Park it instead: stash the sources (an empty video shows the poster),
// allow the poster, and offer an explicit load button. The labelled button is the confirmation step.
const parkedMedia = new WeakSet<HTMLMediaElement>();

const directoryOf = (url: string) => url.slice(0, url.lastIndexOf("/") + 1);

function parkMedia(media: HTMLMediaElement): void {
  if (parkedMedia.has(media)) return;
  parkedMedia.add(media);
  const stash: [Element, string][] = [];
  for (const el of [media, ...media.querySelectorAll("source")]) {
    const src = el.getAttribute("src");
    if (src) stash.push([el, src]);
  }
  for (const [el] of stash) el.removeAttribute("src");
  media.autoplay = false;
  media.load(); // no sources left: clears the error and shows the poster

  const poster = media.getAttribute("poster");
  // Hide mode: collapse the player box, keep the line button below; the poster isn't fetched at all.
  const frame = hideMode ? mediaFrame(media) : media;
  const unhide = hideMode ? hide(frame) : () => {};
  if (!hideMode && poster) {
    const url = new URL(poster, document.baseURI).href;
    allow(url, "image")
      .then(() => {
        media.removeAttribute("poster"); // force a fresh request after the blocked attempt
        (media as HTMLVideoElement).poster = url;
      })
      .catch((err) => console.warn("[altteul]", err));
  }

  const kind = media instanceof HTMLVideoElement ? "동영상" : "오디오";
  const host = document.createElement("span");
  host.style.cssText = "display:block;margin:4px 0";
  const root = host.attachShadow({ mode: "open" });
  root.innerHTML = `<style>${PLACEHOLDER_CSS}.box{min-height:0;flex-direction:row}</style><div class="box"><button type="button"></button></div>`;
  const button = root.querySelector("button")!;
  button.textContent = `▶ ${kind} 불러오기 · 데이터 사용`;
  const restore = (play: boolean) => {
    const urls = [...new Set(stash.map(([, src]) => directoryOf(new URL(src, document.baseURI).href)))];
    // ponytail: allows the whole directory per source (HLS segments); per-segment rules if that over-allows.
    Promise.all(urls.map((u) => allow(u, "media", true)))
      .then(() => {
        for (const [el, src] of stash) el.setAttribute("src", src);
        host.remove();
        unhide();
        media.load();
        if (play) return media.play();
      })
      .catch((err) => console.warn("[altteul]", err));
  };
  onTap(button, () => restore(true));
  // Direct files (mp4) have a real size; within the limit they load without a tap (still no autoplay).
  // HLS playlists report the playlist's size, not the video's, so they always wait for a tap.
  const first = stash[0] && new URL(stash[0][1], document.baseURI).href;
  if (first && !/\.m3u8($|\?)/i.test(first)) {
    sizeInfo(first, media instanceof HTMLVideoElement ? "video" : "audio").then((info) => {
      if (withinLimit(info)) return restore(false);
      if (info.size) button.textContent = `▶ ${kind} 불러오기 · ${formatSize(info.size)}`;
    });
  }
  frame.after(host);
}

// F6 for embedded players: DNR holds the frame back (no player JS, no media). Show its poster and a load
// button in its place. Keep the host list in sync with PLAYER_FRAMES in background.ts.
const PLAYER_FRAME =
  /^https?:\/\/([^/]+\.)?(daum\.net\/video\/embed|play-tv\.kakao\.com\/embed|tv\.kakao\.com\/embed|youtube(-nocookie)?\.com\/embed|tv\.naver\.com\/embed|player\.vimeo\.com\/video)\//;
const parkedFrames = new WeakSet<HTMLIFrameElement>();

function playerPoster(frame: HTMLIFrameElement): string | null {
  const own = frame.getAttribute("poster") ?? frame.getAttribute("data-poster");
  if (own) return new URL(own, document.baseURI).href;
  const yt = frame.src.match(/youtube(?:-nocookie)?\.com\/embed\/([\w-]{11})/);
  return yt ? `https://i.ytimg.com/vi/${yt[1]}/mqdefault.jpg` : null;
}

const loadPlayer = (frame: HTMLIFrameElement, done: () => void) =>
  chrome.runtime
    .sendMessage({ type: "allowPlayer", url: frame.src, host: location.hostname })
    .then((res) => {
      if (!res?.ok) throw new Error(res?.error);
      done();
      frame.src = frame.src; // re-navigate the frame that DNR blocked
    })
    .catch((err) => console.warn("[altteul]", err));

// Hide mode: collapse the player (and its empty wrapper) to one line; no poster download.
function hidePlayer(frame: HTMLIFrameElement): void {
  const box = mediaFrame(frame);
  const line = lineButton(`▶ 동영상${frame.title ? ` · ${frame.title}` : ""} · 불러오기`, box);
  const unhideBox = box !== frame ? hide(box) : () => {};
  const unhideFrame = hide(frame);
  onTap(line.button, () => loadPlayer(frame, () => (line.host.remove(), unhideFrame(), unhideBox())));
  box.before(line.host);
}

function parkPlayer(frame: HTMLIFrameElement): void {
  if (parkedFrames.has(frame) || !PLAYER_FRAME.test(frame.src)) return;
  parkedFrames.add(frame);
  // Players often say width="100%"; use the rendered box, then numeric attributes, then 16:9.
  let w = frame.clientWidth || Number(frame.getAttribute("width"));
  let h = frame.clientHeight || Number(frame.getAttribute("height"));
  if (!w || !h) [w, h] = [16, 9];
  const display = frame.style.display;
  if (hideMode) return hidePlayer(frame);
  const host = document.createElement("span");
  // Responsive embeds pin the iframe absolutely inside a padded wrapper; take the iframe's exact spot.
  const cs = getComputedStyle(frame);
  host.style.cssText =
    cs.position === "absolute"
      ? `position:absolute;top:${cs.top};left:${cs.left};width:${cs.width};height:${cs.height}`
      : `display:block;width:100%;aspect-ratio:${w}/${h};margin:4px 0`;
  const root = host.attachShadow({ mode: "open" });
  root.innerHTML =
    `<style>${PLACEHOLDER_CSS}.player{position:relative;width:100%;height:100%;border-radius:8px;overflow:hidden;background:#000}` +
    `img{width:100%;height:100%;object-fit:cover;display:block}` +
    `button{position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);white-space:nowrap}</style>` +
    `<div class="player"><button type="button">▶ 동영상 불러오기 · 데이터 사용</button></div>`;
  const poster = playerPoster(frame);
  if (poster) {
    allow(poster, "image")
      .then(() => {
        const img = document.createElement("img");
        img.alt = frame.title || "동영상";
        img.src = poster;
        root.querySelector(".player")!.prepend(img);
      })
      .catch((err) => console.warn("[altteul]", err));
  }
  onTap(root.querySelector("button")!, () =>
    loadPlayer(frame, () => {
      host.remove();
      frame.style.display = display;
    }),
  );
  frame.style.setProperty("display", "none", "important");
  frame.before(host);
}

// Lazy images never request anything until scrolled to, so no error event announces them.
// Their loader often preloads off-DOM, so a later error never reaches the page either.
function scan(root: ParentNode, skip: HTMLImageElement | null = null): void {
  for (const img of root.querySelectorAll("img")) {
    const src = img.getAttribute("src");
    if (img !== skip && (!src || src.startsWith("data:")) && lazyUrl(img)) showPlaceholder(img);
  }
  root.querySelectorAll("iframe").forEach(parkPlayer); // both presets block media
}

// Content inserted after load (infinite lists, "많이 본 뉴스" widgets). Batched per frame so a burst of
// inserts costs one scan, not one per node.
function watchInserted(): void {
  let pending: Element[] = [];
  new MutationObserver((records) => {
    if (!pending.length) {
      requestAnimationFrame(() => {
        const batch = pending;
        pending = [];
        for (const el of batch) {
          if (!el.isConnected) continue;
          if (el instanceof HTMLImageElement || el instanceof HTMLIFrameElement) scan(el.parentElement ?? el);
          else scan(el);
        }
      });
    }
    for (const r of records) for (const n of r.addedNodes) if (n instanceof Element) pending.push(n);
  }).observe(document.body, { childList: true, subtree: true });
}

// YouTube: the stream is blocked by DNR (see background.ts). On a watch page, offer one button that allows
// just this video, and block again when the user moves to another video (YouTube navigates without reloads).
const YT_ALLOWED = "altteul-yt-allowed";
const isYouTube = /(^|\.)youtube\.com$/.test(location.hostname);

function ytVideoId(): string | null {
  const u = new URL(location.href);
  return u.searchParams.get("v") ?? u.pathname.match(/^\/shorts\/([\w-]{11})/)?.[1] ?? null;
}

function watchYouTube(): void {
  let bar: HTMLElement | null = null;
  let lastId: string | null | undefined;
  const allowedId = () => {
    try {
      return sessionStorage.getItem(YT_ALLOWED);
    } catch {
      return null;
    }
  };
  const check = () => {
    const id = ytVideoId();
    if (id === lastId) return;
    lastId = id;
    bar?.remove();
    bar = null;
    // Any page that isn't the allowed video revokes the allow. It is a session rule, so it outlives the tab
    // (and the sessionStorage marker) until Safari quits; revoke unconditionally rather than only on change.
    if (allowedId() !== id || !id) {
      try {
        sessionStorage.removeItem(YT_ALLOWED);
      } catch {}
      chrome.runtime.sendMessage({ type: "youtube", host: location.hostname, on: false }).catch(() => {});
    }
    if (!id || allowedId() === id) return;
    bar = document.createElement("div");
    bar.style.cssText = "position:fixed;left:16px;right:16px;bottom:calc(env(safe-area-inset-bottom) + 72px);z-index:2147483647";
    const root = bar.attachShadow({ mode: "open" });
    root.innerHTML =
      `<style>button{width:100%;padding:14px;border:0;border-radius:14px;background:#16a362;color:#fff;` +
      `font:600 16px/1.3 -apple-system,system-ui,sans-serif;box-shadow:0 4px 16px rgb(0 0 0/.3)}` +
      `small{display:block;font-weight:400;font-size:12px;opacity:.85}</style>` +
      `<button type="button">▶ 이 영상 보기<small>알뜰 데이터가 영상을 막아 두었어요 · 누르면 데이터를 써요</small></button>`;
    onTap(root.querySelector("button")!, () => {
      chrome.runtime
        .sendMessage({ type: "youtube", host: location.hostname, on: true })
        .then((res) => {
          if (!res?.ok) throw new Error(res?.error);
          try {
            sessionStorage.setItem(YT_ALLOWED, id);
          } catch {}
          location.reload(); // the player gave up on the blocked stream; a fresh load picks it up
        })
        .catch((e) => console.warn("[altteul]", e));
    });
    document.documentElement.append(bar);
  };
  check();
  setInterval(check, 1000); // ponytail: URL polling; YouTube's own navigation events if this ever costs
}

// Fail-open on our side: an error here must never break the page.
document.addEventListener(
  "DOMContentLoaded",
  () => {
    showFallbackNote();
    preset.then((p) => {
      if (p === "off") return;
      if (isYouTube) watchYouTube();
      const main = p === "save" ? pickMainImage() : null; // strong/text: every image waits for a tap
      const mainUrl = main && lowResUrl(main);
      // The main image loads even when its size is unknown (PRD: 주요 이미지 저화질 로드), but not when its
      // verified size is over the user's limit.
      if (main && mainUrl)
        sizeInfo(mainUrl, "image").then((info) => {
          if (info.size !== null && info.size > info.limit) return;
          loadImage(main).catch((e) => console.warn("[altteul]", e));
        });
      scan(document.body, main);
      watchInserted();
    });
  },
  { once: true },
);

// Popup: "load every image on this page".
chrome.runtime.onMessage.addListener((msg) => {
  if (msg?.type !== "loadAll") return;
  for (const img of document.querySelectorAll("img")) {
    if (placeholders.has(img)) loadImage(img).catch((e) => console.warn("[altteul]", e));
  }
});

