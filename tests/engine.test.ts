import { test } from "node:test";
import assert from "node:assert/strict";
import { getGraph, GOLDEN, GRAPHS } from "../lib/graph/load";
import { plan, defaultNeed, relevantToggles, planFacts } from "../lib/engine";
import { DEFAULT_PROFILE } from "../lib/graph/schema";

const gm = getGraph("gmail")!;
const P = (p: Partial<typeof DEFAULT_PROFILE> = {}) => ({ ...DEFAULT_PROFILE, ...p });

test("golden set is the 10 hand-researched providers, every graph validates", () => {
  assert.equal(GOLDEN.length, 10);
  assert.equal(GRAPHS.length, 16);
});

test("gmail.readonly → restricted → CASA sets a multi-week runway, and the explanation cites facts", () => {
  const p = plan(gm, { caps: ["read"], profile: P() });
  assert.equal(p.tier, "restricted");
  assert.ok(p.days[1] >= 42, `max ${p.days[1]}`);
  assert.ok(p.gatesHit.some((g) => g.gate.kind === "security_assessment"));
  assert.match(p.pole!.text, /gmail\.readonly is restricted → CASA/);
  const ids = new Set(gm.facts.map((f) => f.id));
  assert.ok(p.pole!.facts.length && p.pole!.facts.every((f) => ids.has(f)));
});

test("gmail.send is sensitive: no CASA, shorter runway", () => {
  const p = plan(gm, { caps: ["send"], profile: P() });
  assert.equal(p.tier, "sensitive");
  assert.ok(!p.gatesHit.some((g) => g.gate.kind === "security_assessment"));
  assert.ok(p.days[1] < plan(gm, { caps: ["read"], profile: P() }).days[1]);
});

test("Workspace-internal (team) skips every Google verification gate", () => {
  const p = plan(gm, { caps: ["read", "draft"], profile: P({ audience: "team" }) });
  assert.equal(p.gatesHit.length, 0);
  assert.equal(p.gatesSkipped.length, 3);
  assert.ok(p.live);
});

test("≤100 public users: unverified-app path with a lifetime-cap warning", () => {
  const p = plan(gm, { caps: ["read"], profile: P({ scale: "small" }) });
  assert.ok(p.live);
  assert.ok(p.warnings.some((w) => /100-user cap/.test(w.text)));
});

test("cheaper path: triage + drafts → add-on + gmail.send skips CASA, priced in weeks", () => {
  const p = plan(gm, { caps: ["read", "draft"], profile: P() });
  const alt = p.suggestions.find((s) => s.kind === "alternative");
  assert.ok(alt, "expected a combined alternative");
  assert.deepEqual([...alt!.caps!].sort(), ["addon", "send"]);
  assert.ok(alt!.savesDays >= 21);
  assert.equal(p.suggestions[0].kind, "composio");
});

test("no registered business adds a register-business step before Meta business verification", () => {
  const ig = getGraph("instagram")!;
  const yes = plan(ig, { caps: ["publish"], profile: P() });
  const no = plan(ig, { caps: ["publish"], profile: P({ business: false }) });
  assert.ok(no.steps.some((s) => s.id === "register-business"));
  assert.ok(no.days[1] > yes.days[1]);
  assert.ok(no.steps.find((s) => s.id === "bizver")!.after.includes("register-business"));
});

test("toggles appear only when they change the answer", () => {
  assert.deepEqual(relevantToggles(getGraph("github")!, defaultNeed(getGraph("github")!)), []);
  assert.deepEqual(relevantToggles(getGraph("twitter")!, defaultNeed(getGraph("twitter")!)), []);
  assert.deepEqual(relevantToggles(gm, defaultNeed(gm)).sort(), ["audience", "scale"]);
  assert.ok(relevantToggles(getGraph("outlook")!, defaultNeed(getGraph("outlook")!)).includes("business"));
});

test("recompute is deterministic and fast enough for every tap", () => {
  const t = performance.now();
  for (let i = 0; i < 200; i++) plan(gm, { caps: i % 2 ? ["read"] : ["send", "calendar"], profile: P({ audience: i % 3 ? "public" : "team" }) });
  assert.ok(performance.now() - t < 1500);
  assert.deepEqual(plan(gm, defaultNeed(gm)), plan(gm, defaultNeed(gm)));
});

test("every fact a plan cites exists, and every golden plan has a verdict", () => {
  for (const s of GOLDEN) {
    const g = getGraph(s)!;
    const p = plan(g, defaultNeed(g));
    assert.ok(p.lead.length > 10, s);
    const fs = planFacts(g, p);
    for (const f of fs) assert.ok(f.checked && f.status, `${s}/${f.id}`);
    for (const f of fs) if (f.status === "sourced") assert.ok(f.quote && f.url, `${s}/${f.id} sourced without quote`);
  }
});
