// DNR layering (higher priority wins):
//   1  block per type from the global preset, scoped to sites the user granted access to
//   3  per-site rules, only for types where the site preset differs from the global one
//   4  session allow rules for single URLs the content script picked or the user tapped
// Without site access the content script can't add placeholders or load buttons, so those sites are never
// blocked: they get the original page.
const BASE_PRIORITY = 1;
const SITE_PRIORITY = 3;
const ALLOW_PRIORITY = 4;

type Preset = "off" | "save" | "strong" | "text";
type Kind = "image" | "media" | "font" | "script" | "stylesheet" | "sub_frame";
const KINDS: Kind[] = ["image", "media", "font", "script", "stylesheet", "sub_frame"];

// F2: which resource types each preset blocks at the network layer.
// Image quality (main image low-res vs placeholder only) is decided in the content script.
// "text" keeps only the HTML document: the site's JS/CSS are the bulk of what save mode still downloads
// (87% on a 다음 article). Opt-in only: the PRD otherwise never blocks JS/CSS, and JS-rendered pages go blank.
const BLOCKS: Record<Preset, Record<Kind, boolean>> = {
  off: { image: false, media: false, font: false, script: false, stylesheet: false, sub_frame: false },
  save: { image: true, media: true, font: false, script: false, stylesheet: false, sub_frame: false },
  strong: { image: true, media: true, font: true, script: false, stylesheet: false, sub_frame: false },
  text: { image: true, media: true, font: true, script: true, stylesheet: true, sub_frame: true },
};

// F6: embedded video players load their own heavy JS before any media request, so the whole frame is
// held back on blocked sites and the content script offers a load button. Keep in sync with content.ts.
const PLAYER_FRAMES = [
  "||daum.net/video/embed/",
  "||play-tv.kakao.com/embed/",
  "||tv.kakao.com/embed/",
  "||youtube.com/embed/",
  "||youtube-nocookie.com/embed/",
  "||tv.naver.com/embed/",
  "||player.vimeo.com/video/",
];

// YouTube streams video with fetch (MSE) from googlevideo.com: DNR sees xmlhttprequest, not media, so the
// media block never applies (measured: 10% saved). Block the stream itself on YouTube pages; the content
// script offers "이 영상 보기" per video.
const YT_STREAM = "||googlevideo.com/videoplayback";
const YT_TYPES = ["xmlhttprequest", "media", "other"];
const YT_PAGES = ["youtube.com"];
// Thumbnails and avatars are how people pick a video (10-30KB each, under the default photo limit), and
// their CDN can't be size-checked without a grant. In 절약 they load directly on YouTube pages.
const YT_THUMBS = ["||ytimg.com/", "||ggpht.com/"];

const rule = (
  action: "allow" | "block",
  priority: number,
  condition: chrome.declarativeNetRequest.RuleCondition,
): Omit<chrome.declarativeNetRequest.Rule, "id"> => ({
  priority,
  action: { type: action as chrome.declarativeNetRequest.RuleActionType },
  condition,
});

const types = (t: string[]) => t as chrome.declarativeNetRequest.ResourceType[];

const playerBlocks = (domains?: string[]) =>
  PLAYER_FRAMES.map((urlFilter) =>
    rule("block", BASE_PRIORITY, { urlFilter, resourceTypes: types(["sub_frame"]), ...(domains ? { domains } : {}) }),
  );

type Settings = { preset: Preset; sites: Record<string, Preset> };

async function getSettings(): Promise<Settings> {
  const { preset = "save", sites = {} } = (await chrome.storage.local.get(["preset", "sites"])) as Partial<Settings>;
  return { preset, sites };
}

// Hosts the user granted in Safari, or null for "all websites". Grants look like "*://*.news.naver.com/*".
async function grantedHosts(): Promise<string[] | null> {
  const { origins = [] } = await chrome.permissions.getAll();
  if (origins.some((o) => o === "<all_urls>" || /^[^:]+:\/\/\*\//.test(o))) return null;
  return [...new Set(origins.map((o) => o.replace(/^[^:]+:\/\/(\*\.)?/, "").replace(/\/.*$/, "")))];
}

const covers = (granted: string[] | null, host: string) =>
  granted === null || granted.some((g) => host === g || host.endsWith(`.${g}`));

let lastSync = "";

async function syncRules(): Promise<void> {
  const { preset, sites } = await getSettings();
  const granted = await grantedHosts();
  const key = JSON.stringify([preset, sites, granted]);
  if (key === lastSync) return; // called on every page load; skip no-op rewrites
  const global = BLOCKS[preset];

  const rules: Omit<chrome.declarativeNetRequest.Rule, "id">[] = [];
  const blocked = KINDS.filter((k) => global[k]);
  // iOS Safari accepts initiatorDomains but never matches it; the legacy `domains` key works (verified iOS 26).
  // urlFilter "|http": web pages only. Without it, "all websites" + text mode also blocked the popup's own
  // script (safari-web-extension:// URLs), leaving the popup dead.
  const scope = { urlFilter: "|http", ...(granted ? { domains: granted } : {}) };
  if (granted === null || granted.length) {
    if (blocked.length) rules.push(rule("block", BASE_PRIORITY, { ...scope, resourceTypes: types(blocked) }));
    if (global.media) rules.push(...playerBlocks(granted ?? undefined));
    if (global.media && YT_PAGES.some((h) => covers(granted, `m.${h}`)))
    {
      rules.push(rule("block", BASE_PRIORITY, { urlFilter: YT_STREAM, domains: YT_PAGES, resourceTypes: types(YT_TYPES) }));
      if (preset === "save")
        for (const urlFilter of YT_THUMBS)
          rules.push(rule("allow", SITE_PRIORITY, { urlFilter, domains: YT_PAGES, resourceTypes: types(["image"]) }));
    }
  }
  for (const [host, sitePreset] of Object.entries(sites)) {
    if (!covers(granted, host)) continue;
    const site = BLOCKS[sitePreset];
    const allow = KINDS.filter((k) => global[k] && !site[k]);
    const block = KINDS.filter((k) => !global[k] && site[k]);
    // Media allowed means player frames too.
    if (allow.length)
      rules.push(rule("allow", SITE_PRIORITY, { domains: [host], resourceTypes: types(allow.includes("media") && !allow.includes("sub_frame") ? [...allow, "sub_frame"] : allow) }));
    const isYT = YT_PAGES.some((h) => host === h || host.endsWith(`.${h}`));
    // A site set to 절약 (also the automatic fallback from 글만) gets the thumbnails like global 절약 does.
    if (isYT && sitePreset === "save" && preset !== "save")
      for (const urlFilter of YT_THUMBS)
        rules.push(rule("allow", SITE_PRIORITY, { urlFilter, domains: [host], resourceTypes: types(["image"]) }));
    if (allow.includes("media") && isYT)
      rules.push(rule("allow", SITE_PRIORITY, { urlFilter: YT_STREAM, domains: [host], resourceTypes: types(YT_TYPES) }));
    if (block.length) rules.push(rule("block", SITE_PRIORITY, { urlFilter: "|http", domains: [host], resourceTypes: types(block) }));
    if (block.includes("media")) rules.push(...playerBlocks([host]).map((r) => ({ ...r, priority: SITE_PRIORITY })));
  }
  const old = await chrome.declarativeNetRequest.getDynamicRules();
  await chrome.declarativeNetRequest.updateDynamicRules({
    removeRuleIds: old.map((r) => r.id),
    addRules: rules.map((r, i) => ({ ...r, id: i + 1 })),
  });
  lastSync = key;
}

const resync = () => {
  ruleQueue = ruleQueue.then(syncRules).catch((e) => console.warn("[altteul]", e));
};

async function addSessionAllow(conditions: chrome.declarativeNetRequest.RuleCondition[]): Promise<void> {
  const rules = await chrome.declarativeNetRequest.getSessionRules();
  const seen = new Set(rules.map((r) => JSON.stringify(r.condition)));
  const fresh = conditions.filter((c) => !seen.has(JSON.stringify(c)));
  const max = rules.reduce((m, r) => Math.max(m, r.id), 0);
  if (!fresh.length) return;
  await chrome.declarativeNetRequest.updateSessionRules({
    addRules: fresh.map((condition, i) => ({ ...rule("allow", ALLOW_PRIORITY, condition), id: max + i + 1 })),
  });
}

// prefix: allow everything under the URL (HLS playlists pull many segment URLs from one directory).
const allowUrl = (url: string, kind: "image" | "media", prefix: boolean) =>
  addSessionAllow([{ urlFilter: prefix ? `|${url}` : `|${url}|`, resourceTypes: types([kind]) }]);

// The player frame itself, plus media on this page: the `domains` key matches the top-level page,
// so media requests from inside the player are scoped by the page, not by the frame.
const allowPlayer = (frameUrl: string, pageHost: string) =>
  addSessionAllow([
    { urlFilter: `|${frameUrl}|`, resourceTypes: types(["sub_frame"]) },
    { domains: [pageHost], resourceTypes: types(["media"]) },
  ]);

// One watched video at a time: allowing replaces any previous YouTube allow; leaving the video revokes it.
const ytAllow = (host: string): chrome.declarativeNetRequest.RuleCondition => ({
  urlFilter: YT_STREAM,
  domains: [host],
  resourceTypes: types(YT_TYPES),
});

async function setYouTube(host: string, on: boolean): Promise<void> {
  const rules = await chrome.declarativeNetRequest.getSessionRules();
  const removeRuleIds = rules.filter((r) => r.condition.urlFilter === YT_STREAM).map((r) => r.id);
  if (removeRuleIds.length) await chrome.declarativeNetRequest.updateSessionRules({ removeRuleIds });
  if (on) await addSessionAllow([ytAllow(host)]);
}

async function setSettings(msg: { preset?: Preset; host?: string; sitePreset?: Preset | null }): Promise<void> {
  const settings = await getSettings();
  if (msg.preset) settings.preset = msg.preset;
  if (msg.host) {
    if (msg.sitePreset) settings.sites[msg.host] = msg.sitePreset;
    else delete settings.sites[msg.host];
  }
  await chrome.storage.local.set(settings);
  await syncRules();
}

// F4/F7: resource size before loading. HEAD first; servers that refuse HEAD usually honor a 1-byte Range.
// Cached per URL; at most 4 in flight so a page full of thumbnails doesn't flood the connection.
const sizes = new Map<string, Promise<number | null>>();
let active = 0;
const waiting: (() => void)[] = [];

async function fetchSize(url: string): Promise<number | null> {
  while (active >= 4) await new Promise<void>((r) => waiting.push(r));
  active++;
  try {
    const head = await fetch(url, { method: "HEAD", credentials: "omit" });
    const len = Number(head.headers.get("content-length"));
    if (head.ok && len > 0) return len;
    const range = await fetch(url, { headers: { Range: "bytes=0-0" }, credentials: "omit" });
    range.body?.cancel();
    const total = range.headers.get("content-range")?.match(/\/(\d+)$/)?.[1];
    return total ? Number(total) : null;
  } catch {
    return null; // CORS, network, or no size: the caller just shows no number
  } finally {
    active--;
    waiting.shift()?.();
  }
}

// Cross-origin HEAD only works for hosts the user granted: image CDNs (pstatic.net, daumcdn.net) send no
// CORS headers, so without a grant every request fails ("Load failed", verified iOS 26). Don't send those.
async function sizeOf(url: string): Promise<number | null> {
  if (!covers(await grantedHosts(), new URL(url).hostname)) return null;
  if (!sizes.has(url)) sizes.set(url, fetchSize(url));
  return sizes.get(url)!;
}

// Size limits for auto-loading, set in the container app and read through native messaging (App Group).
// Bytes; 0 = never auto-load. Same defaults as the app.
type MediaKind = "image" | "video" | "audio";
type Limits = Record<MediaKind, number>;
const DEFAULT_LIMITS: Limits = { image: 100 * 1024, video: 0, audio: 0 };
let limits: Promise<Limits> | null = null;

async function readLimits(): Promise<Limits> {
  try {
    const res = await chrome.runtime.sendNativeMessage("com.lotus.altteuldata", { type: "getLimits" });
    if (typeof res?.limits !== "string") return DEFAULT_LIMITS;
    const raw = JSON.parse(res.limits) as Record<string, { value: number; unit: string }>;
    const out = { ...DEFAULT_LIMITS };
    for (const k of Object.keys(out) as MediaKind[]) {
      const v = raw[k];
      if (v && Number.isFinite(v.value)) out[k] = Math.max(0, v.value) * (v.unit === "MB" ? 1048576 : 1024);
    }
    return out;
  } catch {
    return DEFAULT_LIMITS; // app never opened or native host unavailable
  }
}

// Re-read on each navigation so a change in the app applies to the next page.
const getLimits = () => (limits ??= readLimits());

// Serialize rule updates so concurrent requests never pick the same rule id.
let ruleQueue: Promise<unknown> = Promise.resolve();

function enqueue(task: () => Promise<void>, sendResponse: (r: unknown) => void): void {
  ruleQueue = ruleQueue.then(task).then(
    () => sendResponse({ ok: true }),
    (e) => sendResponse({ ok: false, error: String(e) }),
  );
}

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg?.type === "allow" && typeof msg.url === "string") {
    enqueue(() => allowUrl(msg.url, msg.kind === "media" ? "media" : "image", msg.prefix === true), sendResponse);
    return true;
  }
  if (msg?.type === "allowPlayer" && typeof msg.url === "string" && typeof msg.host === "string") {
    enqueue(() => allowPlayer(msg.url, msg.host), sendResponse);
    return true;
  }
  if (msg?.type === "size" && typeof msg.url === "string") {
    const kind: MediaKind = msg.kind === "video" || msg.kind === "audio" ? msg.kind : "image";
    Promise.all([sizeOf(msg.url), getLimits()]).then(([size, l]) => sendResponse({ size, limit: l[kind] }));
    return true;
  }
  if (msg?.type === "youtube" && typeof msg.host === "string") {
    enqueue(() => setYouTube(msg.host, msg.on === true), sendResponse);
    return true;
  }
  if (msg?.type === "setSettings") {
    enqueue(() => setSettings(msg), sendResponse);
    return true;
  }
});

// Grants change in Safari settings or expire ("1일 동안 허용"); re-check on every navigation as a backstop.
chrome.runtime.onInstalled.addListener(resync);
chrome.runtime.onStartup.addListener(resync);
chrome.permissions.onAdded?.addListener(resync);
chrome.permissions.onRemoved?.addListener(resync);
chrome.tabs.onUpdated.addListener((_id, info) => {
  if (info.status === "loading") {
    limits = null;
    resync();
  }
});

