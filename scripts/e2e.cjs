/* End-to-end browser tests (puppeteer-core + a system Chromium).
     npm run e2e                                   → against http://localhost:3100 (a `next start` with GREENLIGHT_FAKE_PIPELINE=1)
     E2E_BASE=https://oauth-greenlight-v2.vercel.app npm run e2e   → against a deployment (the mocked-investigation test is skipped)
   Env: E2E_ONLY=<regex> runs only the tests whose name matches. CHROME_PATH (default /usr/bin/chromium), E2E_CHROME_ARGS (extra Chromium flags, e.g. --no-proxy-server when an
        authenticating egress proxy is set in the environment and Chromium fails with ERR_INVALID_AUTH_CREDENTIALS), E2E_SHOTS=<dir> to save desktop 1440 + mobile 390 screenshots,
        E2E_FAKE=1 when the server runs the fake pipeline (default on for localhost).
   Every page visited also runs the layout audit: no horizontal page overflow, no leaf element whose text spills
   out of its box, no overlapping cells inside a table/board row, no failed _next/static asset, no page errors. */
const puppeteer = require("puppeteer-core");
const fs = require("node:fs");

const BASE = (process.env.E2E_BASE || "http://localhost:3100").replace(/\/$/, "");
const LOCAL = /localhost|127\.0\.0\.1/.test(BASE);
const FAKE = process.env.E2E_FAKE ? process.env.E2E_FAKE === "1" : LOCAL;
const SHOTS = process.env.E2E_SHOTS || "";
const DESKTOP = { width: 1440, height: 900, deviceScaleFactor: 1 };
const MOBILE = { width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const results = [];
let browser;

async function page(vp = DESKTOP, { reduced = true } = {}) {
  const ctx = await browser.createBrowserContext();
  await ctx.overridePermissions(BASE, ["clipboard-read", "clipboard-write", "clipboard-sanitized-write"]);
  const p = await ctx.newPage();
  p.errors = [];
  p.on("pageerror", (e) => p.errors.push("pageerror: " + String(e).slice(0, 300)));
  p.on("response", (r) => { if (r.status() >= 400 && /\/_next\/static\//.test(r.url())) p.errors.push(`asset ${r.status()}: ${r.url()}`); });
  await p.setViewport(vp);
  if (reduced) await p.emulateMediaFeatures([{ name: "prefers-reduced-motion", value: "reduce" }]);
  p.ctx = ctx;
  return p;
}
const close = async (p) => { await p.ctx.close(); };
/* "load" + hydrated + a short settle, not networkidle: the board prefetches guide routes, and puppeteer's idle
   accounting keeps prefetches that were in flight when the previous document unloaded as pending for ~25 s. */
async function go(p, path) {
  await p.goto(BASE + path, { waitUntil: "load", timeout: 90_000 });
  await p.waitForFunction(() => document.readyState === "complete" && !!(window.next && window.next.version), { timeout: 30_000 }).catch(() => {});
  await sleep(600);
}
/** For pages whose state moves while loading (a fake investigation finishes in ~1 s, before networkidle). */
async function goEarly(p, path) { await p.goto(BASE + path, { waitUntil: "domcontentloaded", timeout: 90_000 }); }
async function waitText(p, sel, re, ms = 20_000) {
  await p.waitForFunction((s, src) => [...document.querySelectorAll(s)].some((e) => new RegExp(src).test(e.textContent || "")), { timeout: ms }, sel, re.source);
}
const text = (p, sel) => p.$eval(sel, (e) => e.textContent.trim());
async function clickText(p, sel, re) {
  const ok = await p.evaluate((s, src) => { const el = [...document.querySelectorAll(s)].find((e) => new RegExp(src).test(e.textContent || "") && e.offsetParent !== null); if (el) el.click(); return !!el; }, sel, re.source);
  if (!ok) throw new Error(`no visible ${sel} matching ${re}`);
}

/** Layout audit for the current page. Throws with every problem found. */
async function audit(p, label) {
  const r = await p.evaluate(() => {
    const out = [];
    const vw = window.innerWidth;
    if (document.documentElement.scrollWidth > vw + 1) out.push(`page overflows horizontally: ${document.documentElement.scrollWidth} > ${vw}`);
    const bodyBg = getComputedStyle(document.body).backgroundColor, htmlBg = getComputedStyle(document.documentElement).backgroundColor;
    if (bodyBg === "rgba(0, 0, 0, 0)" && htmlBg === "rgba(0, 0, 0, 0)") out.push("no stylesheet applied (transparent html/body)");
    const visible = (el) => { const cs = getComputedStyle(el); return cs.display !== "none" && cs.visibility !== "hidden" && el.getClientRects().length > 0; };
    const clippedBy = (el) => { for (let a = el.parentElement; a; a = a.parentElement) { const cs = getComputedStyle(a); if (cs.overflowX !== "visible" || a.tagName === "PRE") return true; } return false; };
    for (const el of document.querySelectorAll("main *, header *")) {
      if (el.children.length || !visible(el) || el.closest("[aria-hidden='true'],svg")) continue;
      const cs = getComputedStyle(el);
      if (cs.overflowX !== "visible") continue;
      if (el.scrollWidth > el.clientWidth + 2 && el.clientWidth > 0 && !clippedBy(el)) out.push(`text spills: <${el.tagName.toLowerCase()} class="${String(el.className).slice(0, 40)}"> "${(el.textContent || "").trim().slice(0, 50)}"`);
    }
    // cells inside a row must not overlap each other
    for (const row of document.querySelectorAll('[role="row"]')) {
      if (!visible(row)) continue;
      const cells = [...row.children].filter(visible).map((c) => {
        // measure the content, not the grid track
        const leaves = [...c.querySelectorAll("*")].filter((x) => !x.children.length && visible(x) && (x.textContent || "").trim());
        const rects = (leaves.length ? leaves : [c]).map((x) => x.getBoundingClientRect());
        return { c, rects };
      });
      for (let i = 0; i < cells.length; i++) for (let j = i + 1; j < cells.length; j++)
        for (const a of cells[i].rects) for (const b of cells[j].rects) {
          const w = Math.min(a.right, b.right) - Math.max(a.left, b.left), h = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
          if (w > 1 && h > 1) { out.push(`overlap in row "${(row.textContent || "").trim().slice(0, 40)}": cell ${i} × cell ${j}`); i = j = cells.length; break; }
        }
    }
    return out.slice(0, 12);
  });
  const errs = [...r, ...p.errors];
  if (errs.length) throw new Error(`[audit ${label}] ` + errs.join(" | "));
}
async function shot(p, name) {
  if (!SHOTS) return;
  fs.mkdirSync(SHOTS, { recursive: true });
  const vw = (await p.viewport()).width;
  const tag = vw < 800 ? "mobile" : "desktop";
  // fixed bottom bars would float mid-page in a full-page capture: pin them to the end of the document
  await p.evaluate(() => { const H = document.documentElement.scrollHeight; for (const el of document.querySelectorAll("body *")) { const cs = getComputedStyle(el); if (cs.position === "fixed" && cs.bottom !== "auto" && !el.classList.contains("toast") && !el.closest('[role="dialog"]')) { el.style.position = "absolute"; el.style.top = H - el.offsetHeight - 12 + "px"; el.style.bottom = "auto"; } } });
  const dialog = await p.$('[role="dialog"]');
  await p.screenshot({ path: `${SHOTS}/${name}-${tag}.png`, fullPage: !dialog });
}

async function t(name, fn, { skip } = {}) {
  if (process.env.E2E_ONLY && !new RegExp(process.env.E2E_ONLY, "i").test(name)) return;
  if (skip) { results.push({ name, status: "skipped", why: skip }); console.log(`- SKIP ${name}: ${skip}`); return; }
  const t0 = Date.now();
  try { await fn(); results.push({ name, status: "pass", ms: Date.now() - t0 }); console.log(`✓ ${name} (${Date.now() - t0} ms)`); }
  catch (e) { results.push({ name, status: "fail", error: String(e.message || e).slice(0, 600) }); console.log(`✗ ${name}\n    ${String(e.message || e).slice(0, 600)}`); }
}

(async () => {
  browser = await puppeteer.launch({ executablePath: process.env.CHROME_PATH || "/usr/bin/chromium", args: ["--no-sandbox", "--disable-dev-shm-usage", ...(process.env.E2E_CHROME_ARGS || "").split(/\s+/).filter(Boolean)] });
  const fakeApp = `Zentrybooks${String(Date.now()).slice(-5)}`;
  const fakeSlug = fakeApp.toLowerCase();

  await t("home loads styled (desktop + mobile), no failed assets, no overflow", async () => {
    for (const vp of [DESKTOP, MOBILE]) {
      const p = await page(vp);
      await go(p, "/");
      const bg = await p.evaluate(() => getComputedStyle(document.body).backgroundColor + "|" + getComputedStyle(document.querySelector(".panel")).borderRadius);
      if (!/14px/.test(bg)) throw new Error(`panel styles missing: ${bg}`);
      const rows = await p.$$eval('[role="table"] a[role="row"]', (r) => r.length);
      if (rows < 10) throw new Error(`board has ${rows} rows`);
      const headerBar = await p.$eval('header input[aria-label^="Find an app"]', (e) => e.offsetParent !== null).catch(() => "missing");
      if (headerBar !== false) throw new Error(`header command bar on Home should be in the DOM but hidden, got ${headerBar}`);
      await audit(p, `home ${vp.width}`);
      await shot(p, "home");
      await close(p);
    }
  });

  await t("command bar: library match (prefix + typo) and Enter opens the guide", async () => {
    const p = await page();
    await go(p, "/");
    await p.type("main input", "hubspt");
    await waitText(p, "#cmd-results", /HubSpot/);
    if (await p.$$eval("#cmd-results a", (a) => a.some((x) => /Investigate/.test(x.textContent)))) throw new Error("offered a new investigation for a typo of a library app");
    await p.click("main input", { clickCount: 3 });
    await p.type("main input", "gmai");
    await waitText(p, "#cmd-results", /Gmail/);
    await audit(p, "results");
    await shot(p, "search");
    await Promise.all([p.waitForNavigation({ waitUntil: "networkidle2" }), p.keyboard.press("Enter")]);
    if (!/\/guide\/gmail/.test(p.url())) throw new Error(`went to ${p.url()}`);
    await waitText(p, "h1", /Gmail/);
    await close(p);
  });

  await t("curated guide (Gmail): verdict, badge, runway; desktop + mobile audit", async () => {
    for (const vp of [DESKTOP, MOBILE]) {
      const p = await page(vp);
      await go(p, "/guide/gmail");
      await waitText(p, "h1", /Gmail/);
      await waitText(p, ".badge", /Curated/);
      const lead = await p.$eval('[aria-live="polite"]', (e) => e.textContent);
      if (!/until real users can connect|connect today/.test(lead)) throw new Error(`no verdict: ${lead.slice(0, 80)}`);
      await audit(p, `gmail ${vp.width}`);
      // expand the first three sections and audit again
      await p.evaluate(() => [...document.querySelectorAll('main section > h2 > button[aria-expanded="false"]')].slice(0, 3).forEach((b) => b.click()));
      await sleep(500);
      await audit(p, `gmail open ${vp.width}`);
      await shot(p, "gmail");
      await close(p);
    }
  });

  await t("toggle chips: plan recomputes (wait changes, URL keeps the need)", async () => {
    const p = await page();
    await go(p, "/guide/gmail");
    const before = await text(p, '[aria-label="Runway"] .mono');
    await clickText(p, "button.chip", /Send email only/);
    await clickText(p, "button.chip", /Read email/);
    await p.waitForFunction((b) => document.querySelector('[aria-label="Runway"] .mono').textContent.trim() !== b, { timeout: 5000 }, before);
    const after = await text(p, '[aria-label="Runway"] .mono');
    if (!/need=/.test(p.url())) throw new Error(`URL lost the need: ${p.url()}`);
    const pressed = await p.$$eval("button.chip[aria-pressed=true]", (b) => b.map((x) => x.textContent));
    if (!pressed.some((x) => /Send email only/.test(x)) || pressed.some((x) => /^Read email/.test(x))) throw new Error(`chips: ${pressed}`);
    console.log(`    wait ${before} → ${after}`);
    await close(p);
  });

  await t("setup kit opens as a dialog, copy works, Escape closes", async () => {
    for (const vp of [DESKTOP, MOBILE]) {
      const p = await page(vp);
      await go(p, "/guide/gmail");
      await clickText(p, "button", /Setup kit/);
      await p.waitForSelector('[role="dialog"]', { visible: true });
      await waitText(p, '[role="dialog"] h3', /Redirect URIs/);
      await shot(p, "kit");
      await p.keyboard.press("Escape");
      await p.waitForFunction(() => !document.querySelector('[role="dialog"]'), { timeout: 3000 });
      await close(p);
    }
  });

  await t("copy link puts the guide URL (with choices) on the clipboard", async () => {
    const p = await page();
    await go(p, "/guide/gmail?need=send");
    await clickText(p, "button", /Copy link/);
    await waitText(p, '[role="status"]', /Link copied/, 5000);
    const clip = await p.evaluate(() => navigator.clipboard.readText().catch((e) => "ERR " + e));
    if (!/\/guide\/gmail/.test(clip)) throw new Error(`clipboard: ${clip}`);
    await close(p);
  });

  await t("pin to Your apps survives a reload; unpin removes it", async () => {
    const p = await page();
    await go(p, "/guide/slack");
    await clickText(p, "button", /^Pin$/);
    await waitText(p, '[role="status"]', /Pinned/, 5000);
    await go(p, "/");
    await waitText(p, 'section[aria-label="Your apps"]', /Slack/);
    const pinnedLabel = await p.$eval('section[aria-label="Your apps"]', (s) => s.textContent);
    if (!/pinned/.test(pinnedLabel)) throw new Error("Slack not shown as pinned");
    await p.reload({ waitUntil: "load" });
    await sleep(600);
    await waitText(p, 'section[aria-label="Your apps"]', /Slack/);
    await audit(p, "home with shelf");
    await shot(p, "home-shelf");
    await p.click('section[aria-label="Your apps"] button[aria-label="Unpin Slack"]');
    await sleep(300);
    const still = await p.$eval('section[aria-label="Your apps"]', (s) => /Slack · pinned|pinned/.test(s.textContent)).catch(() => false);
    if (still) throw new Error("still pinned after unpin");
    await close(p);
  });

  await t("live investigation (fake pipeline): lanes complete, guide fills in as Draft, reload is served from the store", async () => {
    const p = await page();
    await go(p, `/guide/${fakeSlug}?q=${fakeApp}`);
    await waitText(p, "button", /lanes/, 10_000);
    await waitText(p, ".badge", /Draft/, 30_000);
    const lanes = await p.$eval('section[aria-label="Investigation"]', (s) => s.textContent);
    if (!/5\/5 lanes/.test(lanes)) throw new Error(`lanes: ${lanes.slice(0, 120)}`);
    await audit(p, "generated");
    await shot(p, "generated");
    await go(p, `/guide/${fakeSlug}`);
    await waitText(p, ".badge", /Draft/, 5000);
    if (await p.$('section[aria-label="Investigation"]')) throw new Error("re-investigated instead of serving the stored guide");
    await close(p);
  }, { skip: FAKE ? undefined : "deployment runs the real pipeline (no fake), so this mocked test is local-only; the live smoke check covers a real run" });

  await t("investigation in progress renders (screenshot of lanes mid-run)", async () => {
    const p = await page();
    const app = `Midrunly${String(Date.now()).slice(-5)}`;
    await goEarly(p, `/guide/${app.toLowerCase()}?q=${app}`);
    await waitText(p, "button", /Investigating/, 10_000);
    await audit(p, "investigating");
    await shot(p, "live");
    await close(p);
    const m = await page(MOBILE);
    await goEarly(m, `/guide/${app.toLowerCase()}x?q=${app}x`);
    await waitText(m, "button", /Investigating/, 10_000);
    await audit(m, "investigating mobile");
    await shot(m, "live");
    await close(m);
  }, { skip: FAKE ? undefined : "needs the fake pipeline" });

  await t("trace page opens from a guide and lists stages", async () => {
    const p = await page();
    let traceHref;
    if (FAKE) {
      await go(p, `/guide/${fakeSlug}`);
      await clickText(p, "main section > h2 > button", /Run trace/);
      traceHref = await p.$eval('a[href^="/trace/"]', (a) => a.getAttribute("href"));
    } else {
      traceHref = "/trace/" + (process.env.E2E_TRACE || "");
    }
    await go(p, traceHref);
    await waitText(p, "h2", /Stages/, 15_000);
    await audit(p, "trace");
    await shot(p, "trace");
    await close(p);
    const m = await page(MOBILE);
    await go(m, traceHref);
    await waitText(m, "h2", /Stages/, 15_000);
    await audit(m, "trace mobile");
    await shot(m, "trace");
    await close(m);
  }, { skip: FAKE || process.env.E2E_TRACE ? undefined : "no trace id given (set E2E_TRACE)" });

  await t("mobile 390: every page fits, actions bar present on guides", async () => {
    const m = await page(MOBILE);
    for (const path of ["/", "/guide/gmail", "/guide/docusign", "/guide/shopify", "/guide/hubspot", "/trace/does-not-exist"]) {
      await go(m, path);
      await audit(m, `mobile ${path}`);
    }
    await go(m, "/guide/gmail");
    const bar = await m.$$eval("button", (b) => b.filter((x) => /Setup kit/.test(x.textContent) && x.offsetParent).length);
    if (!bar) throw new Error("no Setup kit button on mobile");
    await close(m);
    const n = await page({ ...MOBILE, width: 375 });
    for (const path of ["/", "/guide/gmail"]) { await go(n, path); await audit(n, `375 ${path}`); }
    await close(n);
  });

  await t("board rows: no overlap at 1024 and 1440 (Docusign / Shopify long gates)", async () => {
    for (const w of [1024, 1280, 1440]) {
      const p = await page({ width: w, height: 900 });
      await go(p, "/");
      await audit(p, `board ${w}`);
      const clipped = await p.$$eval('a[role="row"]', (rows) => rows.filter((r) => /Docusign|Shopify/.test(r.textContent)).map((r) => { const c = r.children[2]?.querySelector("span"); return c ? { t: c.title, w: c.scrollWidth, cw: c.clientWidth } : null; }));
      if (!clipped.every((c) => c && c.t)) throw new Error(`long gates without a tooltip at ${w}: ${JSON.stringify(clipped)}`);
      await close(p);
    }
  });

  await t("reduced motion: no running animations after toggling, sections open instantly", async () => {
    const p = await page(DESKTOP, { reduced: true });
    await go(p, "/guide/gmail");
    await clickText(p, "button.chip", /Send email only/);
    await clickText(p, "main section > h2 > button", /Steps/);
    const running = await p.evaluate(() => document.getAnimations().filter((a) => a.playState === "running").length);
    if (running) throw new Error(`${running} animations running under reduced motion`);
    const h = await p.$eval("#sec-steps-body", (e) => e.getBoundingClientRect().height);
    if (h < 40) throw new Error(`steps section not open (height ${h})`);
    const dur = await p.$eval(".chip", (e) => getComputedStyle(e).transitionDuration);
    if (!/^0s/.test(dur)) throw new Error(`chip transition ${dur}`);
    await close(p);
    const q = await page(DESKTOP, { reduced: false });
    await go(q, "/guide/gmail");
    await clickText(q, "main section > h2 > button", /Steps/);
    const anims = await q.evaluate(() => document.getAnimations().length);
    console.log(`    with motion: ${anims} animation(s) on expand`);
    await close(q);
  });

  /* Click-to-feedback timing. Real mouse click on a board row with motion ON (what users have). In-page clock:
     t0 = the pointerdown event; feedback = the first animation frame after the row shows its pressed state (or the
     route swapped); content = the first frame with the guide's title on /guide/. Desktop and a mid phone
     (390 px, CPU 4x slower, Fast 4G: 150 ms RTT, ~9 Mbps). Limits: feedback < 100 ms; content < 1 s desktop, < 1.5 s phone. */
  async function clickTiming(vp, throttle) {
    const p = await page(vp, { reduced: false });
    if (throttle) {
      const c = await p.target().createCDPSession();
      await c.send("Network.enable");
      await c.send("Network.emulateNetworkConditions", { offline: false, latency: 150, downloadThroughput: (9 * 1024 * 1024) / 8, uploadThroughput: (1.5 * 1024 * 1024) / 8 });
      await c.send("Emulation.setCPUThrottlingRate", { rate: 4 });
    }
    await go(p, "/");
    const sel = 'a[role="row"][href="/guide/gmail"]';
    await p.waitForSelector(sel);
    await p.$eval(sel, (el) => el.scrollIntoView({ block: "center" }));
    await sleep(1200); // viewport prefetch, as after a real scroll
    await p.evaluate((sel) => {
      const m = (window.__m = {});
      window.addEventListener("pointerdown", (e) => {
        m.t0 = e.timeStamp;
        const row = document.querySelector(sel);
        const tick = (now) => {
          const pend = row && row.isConnected && row.getAttribute("data-pending") === "true";
          const swapped = location.pathname !== "/" || !!document.querySelector("[data-route-loading]");
          if (m.feedback == null && (pend || swapped)) m.feedback = now - m.t0;
          if (m.content == null && location.pathname.startsWith("/guide/") && document.querySelector('h1[data-vt="app-title"]')) m.content = now - m.t0;
          if (m.content == null) requestAnimationFrame(tick);
        };
        requestAnimationFrame(tick);
      }, { capture: true, once: true });
    }, sel);
    await p.click(sel);
    await p.waitForFunction(() => window.__m && window.__m.content != null, { timeout: 15_000 });
    const m = await p.evaluate(() => window.__m);
    const errs = p.errors.slice();
    await close(p);
    if (errs.length) throw new Error(errs.join(" | "));
    return { feedback: Math.round(m.feedback), content: Math.round(m.content) };
  }
  await t("board click: visible feedback < 100 ms and the guide within budget (desktop + throttled phone)", async () => {
    const d = await clickTiming(DESKTOP, false);
    const m = await clickTiming(MOBILE, true);
    console.log(`    desktop: feedback ${d.feedback} ms, guide ${d.content} ms · phone (4x CPU, Fast 4G): feedback ${m.feedback} ms, guide ${m.content} ms`);
    const bad = [];
    if (d.feedback >= 100) bad.push(`desktop feedback ${d.feedback} ms`);
    if (m.feedback >= 100) bad.push(`phone feedback ${m.feedback} ms`);
    if (d.content >= 1000) bad.push(`desktop guide ${d.content} ms`);
    if (m.content >= 1500) bad.push(`phone guide ${m.content} ms`);
    if (bad.length) throw new Error(bad.join(", "));
  });

  await t("gibberish is rejected fast: 'asdfgh' + Enter answers in < 2 s, never navigates or investigates", async () => {
    const p = await page();
    await go(p, "/");
    await p.type('main input[aria-label^="Name an app"]', "asdfgh");
    await waitText(p, "#cmd-results", /Investigate/);
    const t0 = Date.now();
    await p.keyboard.press("Enter");
    await waitText(p, "[data-rejected]", /Couldn't find an app called "asdfgh"/, 5000);
    const ms = Date.now() - t0;
    console.log(`    rejected in ${ms} ms`);
    if (ms >= 2000) throw new Error(`took ${ms} ms`);
    await sleep(300);
    if (new URL(p.url()).pathname !== "/") throw new Error(`navigated to ${p.url()}`);
    const sugg = await p.$$eval("[data-rejected] a", (a) => a.length);
    if (!sugg) throw new Error("no suggestions shown");
    await audit(p, "rejected");
    await close(p);
    // a direct URL is gated on the server too
    const q = await page(MOBILE);
    await goEarly(q, "/guide/asdfgh?q=asdfgh");
    await waitText(q, "[data-rejected]", /Couldn't find an app called "asdfgh"/, 8000);
    if (await q.$('section[aria-label="Investigation"]')) throw new Error("investigation panel shown for gibberish");
    await audit(q, "rejected direct url");
    await close(q);
  });

  await t("status and store APIs answer", async () => {
    const p = await page();
    const s = await p.goto(BASE + "/api/status").then((r) => r.json());
    if (!s.store || !s.fallbackOrder) throw new Error("status missing store/fallbackOrder");
    console.log(`    store=${s.store.mode} guides=${s.store.guides} primary=${s.primary?.id || "none"}`);
    const st = await p.goto(BASE + "/api/store").then((r) => r.json());
    if (!Array.isArray(st.guides)) throw new Error("store list missing");
    await close(p);
  });

  await browser.close();
  const pass = results.filter((r) => r.status === "pass").length, fail = results.filter((r) => r.status === "fail").length, skip = results.filter((r) => r.status === "skipped").length;
  console.log(`\ne2e ${BASE}: ${pass} passed, ${fail} failed, ${skip} skipped (${results.length} total)`);
  if (process.env.E2E_REPORT) fs.writeFileSync(process.env.E2E_REPORT, JSON.stringify({ base: BASE, at: new Date().toISOString(), pass, fail, skip, results }, null, 1));
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(2); });
