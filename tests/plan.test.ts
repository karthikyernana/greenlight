import { test } from "node:test";
import assert from "node:assert/strict";
import { getGuide, libraryIndex } from "../lib/library";
import { headline, verdict, criticalPath, runway, activeSteps, defaultSelection, startToday, longPole } from "../lib/plan";
import { buildKit, COMPOSIO_CALLBACK } from "../lib/kit";
import { match, exact, hrefFor } from "../lib/search";

const gmail = getGuide("gmail")!;
const github = getGuide("github")!;
const x = getGuide("twitter")!;

test("scopes decide the wait: Gmail read vs send vs sign-in", () => {
  const read = headline(gmail, ["signin", "read"]);
  const send = headline(gmail, ["signin", "send"]);
  const signin = headline(gmail, ["signin"]);
  assert.equal(read.tier, "restricted");
  assert.equal(send.tier, "review");
  assert.equal(signin.tier, "instant");
  assert.ok(read.sch.daysMax >= 35, `read should take 5+ weeks, got ${read.sch.daysMax}`);
  assert.ok(send.sch.daysMax < read.sch.daysMax / 2, "send-only should be far shorter than read");
  assert.equal(signin.wait, "Same day");
  // CASA only appears when reading mail
  assert.ok(activeSteps(gmail, ["signin", "read"]).some((s) => s.id === "casa"));
  assert.ok(!activeSteps(gmail, ["signin", "send"]).some((s) => s.id === "casa"));
});

test("verdict names the pacing capability and the long pole", () => {
  const v = verdict(gmail, ["signin", "read"]);
  assert.match(v.lead, /^Read email: /);
  assert.match(v.pole || "", /CASA security assessment/);
  assert.equal(longPole(activeSteps(gmail, ["signin", "read"]))?.id, "casa");
  const gh = verdict(github, defaultSelection(github));
  assert.match(gh.lead, /live today/);
  const xv = verdict(x, defaultSelection(x));
  assert.match(xv.pole || "", /billed/);
});

test("critical path for Gmail read runs domain → brand → scope review → CASA", () => {
  const cp = criticalPath(activeSteps(gmail, ["signin", "read"]));
  assert.deepEqual(cp.slice(-3), ["brand", "scopes", "casa"]);
  assert.ok(startToday(activeSteps(gmail, ["signin", "read"])).some((s) => s.id === "domain"));
});

test("runway bars stay on the ruler and never overlap within a lane row", () => {
  for (const g of [gmail, github, x, getGuide("salesforce")!, getGuide("linkedin")!]) {
    const all = runway(activeSteps(g, g.capabilities.map((c) => c.id)));
    for (const b of all.bars) {
      assert.ok(b.x0 >= 0 && b.x0 <= 1 && (b.x2 ?? b.x1) <= 1.0001, `${g.slug} bar ${b.ns} off ruler`);
    }
    const byRow = new Map<string, typeof all.bars>();
    for (const b of all.bars) byRow.set(`${b.lane}:${b.row}`, [...(byRow.get(`${b.lane}:${b.row}`) || []), b]);
    for (const [k, bars] of byRow) {
      const s = [...bars].sort((a, b) => a.x0 - b.x0);
      for (let i = 1; i < s.length; i++) {
        const prevEnd = Math.max(s[i - 1].x2 ?? s[i - 1].x1, s[i - 1].x0 + 0.02 + 0.035 * s[i - 1].ns.length);
        assert.ok(s[i].x0 + 0.0021 >= prevEnd, `${g.slug} ${k}: bar ${s[i].ns} overlaps ${s[i - 1].ns}`);
      }
    }
  }
});

test("setup kit: callback, least-privilege scopes, justification only when reviewed", () => {
  const kit = buildKit(gmail, ["signin", "read"]);
  const ids = kit.map((k) => k.id);
  assert.ok(kit.find((k) => k.id === "redirects")!.body.includes(COMPOSIO_CALLBACK));
  assert.ok(kit.find((k) => k.id === "scopes")!.body.includes("gmail.readonly"));
  assert.ok(!kit.find((k) => k.id === "scopes")!.body.split("\n")[0].includes("gmail.send"));
  assert.ok(ids.includes("justification") && ids.includes("video"));
  assert.match(kit.find((k) => k.id === "justification")!.body, /Limited Use/);
  const ghKit = buildKit(github, defaultSelection(github)).map((k) => k.id);
  assert.ok(!ghKit.includes("justification"), "no review → no justification draft");
  assert.ok(ghKit.includes("agent"));
});

test("board search: prefix, exact URL and unknown apps", () => {
  const idx = libraryIndex();
  assert.equal(match(idx, "gma")[0].slug, "gmail");
  assert.equal(exact(idx, "calendly.com")?.slug, "calendly");
  assert.equal(hrefFor(null, "Acme Billing"), "/guide/acme-billing?q=Acme%20Billing");
  const airtable = idx.find((e) => e.slug === "airtable");
  if (airtable) assert.match(hrefFor(airtable, "airtable"), /^\/guide\/airtable\?q=/);
  assert.ok(idx.length >= 100 && idx.filter((e) => e.curated || e.generated).length >= 16);
});
