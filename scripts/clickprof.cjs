/* Click-to-feedback profiler. node scripts/clickprof.cjs <base> [mobile|desktop] [slug]
   Loads Home, waits idle, clicks the board row for <slug>, and measures (page clock):
   - feedback: first frame after click where the DOM changed (pressed state, route skeleton, or the new page)
   - url: when location.pathname changed
   - content: when the guide's h1 (data-vt=app-title) with the app name is in the DOM and painted
   Also logs network requests made after the click and long tasks. */
const puppeteer = require("puppeteer-core");
const BASE = (process.argv[2] || "https://oauth-greenlight-v2.vercel.app").replace(/\/$/, "");
const MODE = process.argv[3] || "mobile";
const SLUG = process.argv[4] || "gmail";
const RUNS = Number(process.env.RUNS || 3);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
(async () => {
  const args = ["--no-sandbox", ...(process.env.E2E_CHROME_ARGS || "").split(" ").filter(Boolean)];
  const browser = await puppeteer.launch({ executablePath: process.env.CHROME_PATH || "/usr/bin/chromium", headless: true, args });
  const out = [];
  for (let run = 0; run < RUNS; run++) {
    const ctx = await browser.createBrowserContext();
    const p = await ctx.newPage();
    const errors = [];
    p.on("pageerror", (e) => errors.push(String(e).slice(0, 200)));
    if (MODE === "mobile") {
      await p.setViewport({ width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
      const c = await p.target().createCDPSession();
      await c.send("Network.enable");
      // Fast 4G (Lighthouse/Chrome preset): 150 ms RTT, ~9 Mbps down, ~1.5 Mbps up
      await c.send("Network.emulateNetworkConditions", { offline: false, latency: 150, downloadThroughput: (9 * 1024 * 1024) / 8, uploadThroughput: (1.5 * 1024 * 1024) / 8 });
      await c.send("Emulation.setCPUThrottlingRate", { rate: 4 });
    } else await p.setViewport({ width: 1440, height: 900 });
    const reqs = [];
    p.on("request", (r) => reqs.push({ t: Date.now(), url: r.url().replace(BASE, ""), type: r.resourceType() }));
    p.on("requestfinished", (r) => { const x = reqs.find((q) => q.url === r.url().replace(BASE, "") && !q.done); if (x) { x.done = Date.now(); } });
    const tLoad0 = Date.now();
    await p.goto(BASE + "/", { waitUntil: "networkidle0", timeout: 120_000 });
    const loadMs = Date.now() - tLoad0;
    await sleep(1500);
    await p.evaluate(() => {
      window.__lt = [];
      try { new PerformanceObserver((l) => { for (const e of l.getEntries()) window.__lt.push({ start: e.startTime, dur: e.duration }); }).observe({ type: "longtask", buffered: false }); } catch {}
    });
    const sel = `a[role="row"][href^="/guide/${SLUG}"]`;
    await p.waitForSelector(sel, { timeout: 30_000 });
    await p.$eval(sel, (el) => el.scrollIntoView({ block: "center" }));
    await sleep(800); // viewport prefetch gets its chance, as a real user's scroll would
    const tClickWall = Date.now();
    const pre = await p.evaluate((sel, slug) => {
      window.__m = { click: 0 };
      const html0 = document.querySelector("main")?.outerHTML.length || 0;
      const row = document.querySelector(sel);
      const check = () => {
        const now = performance.now();
        const m = window.__m;
        const mainEl = document.querySelector("main");
        const changed = !!(row && (row.getAttribute("data-pending") === "true" || row.matches(":active"))) || !document.body.contains(row) || (mainEl && mainEl.outerHTML.length !== html0) || !!document.querySelector("[data-route-loading]");
        if (!m.feedback && changed) m.feedback = now - m.click;
        if (!m.url && location.pathname.startsWith("/guide/")) m.url = now - m.click;
        const h = document.querySelector('h1[data-vt="app-title"]');
        if (!m.content && h && location.pathname.startsWith("/guide/")) m.content = now - m.click;
        if (!m.content || !m.feedback) requestAnimationFrame(check);
      };
      window.__m.click = performance.now();
      row.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true }));
      row.click();
      requestAnimationFrame(check);
      return true;
    }, sel, SLUG);
    try { await p.waitForFunction(() => window.__m && window.__m.content, { timeout: 30_000, polling: 50 }); } catch {}
    await sleep(1500);
    const m = await p.evaluate(() => ({ ...window.__m, lt: (window.__lt || []).filter((x) => x.start > window.__m.click - 5) }));
    const after = reqs.filter((r) => r.t >= tClickWall).map((r) => ({ at: r.t - tClickWall, dur: r.done ? r.done - r.t : null, url: r.url.slice(0, 90), type: r.type }));
    const homeJs = reqs.filter((r) => r.t < tClickWall && r.type === "script").length;
    out.push({ run, loadMs, feedback: Math.round(m.feedback || -1), url: Math.round(m.url || -1), content: Math.round(m.content || -1), longTasks: m.lt.map((x) => Math.round(x.dur)), homeScripts: homeJs, afterClick: after, errors });
    await ctx.close();
  }
  console.log(JSON.stringify({ base: BASE, mode: MODE, slug: SLUG, runs: out }, null, 1));
  await browser.close();
})().catch((e) => { console.error(e); process.exit(1); });
