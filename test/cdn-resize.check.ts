// Self-check for cdnResize (copied from src/content.ts). Run: npm run test:cdn
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


const cases: [string, number, string][] = [
  ["https://imgnews.pstatic.net/a.jpg?type=w860", 408, "https://imgnews.pstatic.net/a.jpg?type=w480"],
  ["https://imgnews.pstatic.net/a.jpg?type=w647", 600, "https://imgnews.pstatic.net/a.jpg?type=w647"],
  ["https://imgnews.pstatic.net/a.jpg?type=w480", 300, "https://imgnews.pstatic.net/a.jpg?type=w480"],
  ["https://mimgnews.pstatic.net/a.jpg?type=nf352_352", 300, "https://mimgnews.pstatic.net/a.jpg?type=nf352_352"],
  ["https://img1.daumcdn.net/thumb/S1200x630/?fname=x", 408, "https://img1.daumcdn.net/thumb/R408x0/?fname=x"],
  ["https://img1.daumcdn.net/thumb/T160x160.q80/?fname=x", 408, "https://img1.daumcdn.net/thumb/T160x160.q80/?fname=x"],
  ["https://example.com/a.jpg?w=2000", 408, "https://example.com/a.jpg?w=2000"],
];
for (const [inp, t, want] of cases) {
  const got = cdnResize(inp, t);
  if (got !== want) throw new Error(`${inp} @${t}: got ${got}, want ${want}`);
}
console.log(`cdnResize: ${cases.length} cases ok`);
