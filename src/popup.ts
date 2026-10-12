// Measured savings vs the original page: 네이버 뉴스, 다음 뉴스, 나무위키, 유튜브, cold cache (test/savings-4sites.md).
const PRESET_DESC: Record<string, string> = {
  off: "원본 그대로 보여요.",
  save: "작은 사진은 바로, 큰 사진·동영상은 버튼으로. <b>실측 42~82% 절약</b>",
  strong: "사진도 모두 탭해서 불러와요. <b>실측 48~92% 절약</b>",
  text: "글만 받아요. 영상 사이트는 절약으로 바뀌어요. <b>실측 93~99% 절약</b>",
};

// Popup: global preset, this site's override, and "load everything" for the current page.
async function initPopup(): Promise<void> {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  const pageHost = tab?.url?.startsWith("http") ? new URL(tab.url).hostname : "";
  const stored = (await chrome.storage.local.get(["preset", "sites", "view"])) as {
    preset?: string;
    sites?: Record<string, string>;
    view?: string;
  };
  const { preset = "save", sites = {}, view = "keep" } = stored;

  const radio = (name: string, value: string) =>
    document.querySelector<HTMLInputElement>(`input[name="${name}"][value="${value}"]`)!;
  radio("preset", preset).checked = true;
  const desc = document.getElementById("preset-desc")!;
  desc.innerHTML = PRESET_DESC[preset] ?? "";
  radio("site", sites[pageHost] ?? "").checked = true;
  radio("view", view).checked = true;
  document.getElementById("site-legend")!.textContent = pageHost ? `이 사이트 · ${pageHost}` : "이 사이트";
  (document.getElementById("site") as HTMLFieldSetElement).disabled = !pageHost;
  (document.getElementById("load-all") as HTMLButtonElement).disabled = !pageHost;

  // Save through the background so DNR rules are updated before the page reloads.
  const save = async (msg: object) => {
    const res = await chrome.runtime.sendMessage({ type: "setSettings", ...msg });
    if (!res?.ok) return console.warn("[altteul] save failed", res);
    if (tab?.id && pageHost) chrome.tabs.reload(tab.id);
  };
  document.getElementById("preset")!.addEventListener("change", (e) => {
    desc.innerHTML = PRESET_DESC[(e.target as HTMLInputElement).value] ?? "";
    save({ preset: (e.target as HTMLInputElement).value });
  });
  document.getElementById("site")!.addEventListener("change", (e) => {
    save({ host: pageHost, sitePreset: (e.target as HTMLInputElement).value || null });
  });
  // Display-only setting: no DNR change, so write storage directly and reload.
  document.getElementById("view")!.addEventListener("change", async (e) => {
    await chrome.storage.local.set({ view: (e.target as HTMLInputElement).value });
    if (tab?.id && pageHost) chrome.tabs.reload(tab.id);
  });
  document.getElementById("load-all")!.addEventListener("click", () => {
    if (tab?.id) chrome.tabs.sendMessage(tab.id, { type: "loadAll" });
    window.close();
  });
}

initPopup().catch((e) => console.warn("[altteul]", e));
