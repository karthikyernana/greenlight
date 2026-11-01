import { getGraph, GOLDEN } from "../lib/graph/load";
import { plan, defaultNeed } from "../lib/engine";
for (const s of GOLDEN) {
  const g = getGraph(s)!;
  const p = plan(g, defaultNeed(g));
  console.log(`${s.padEnd(10)} ${p.lead} | ${p.pole?.text || ""} | toggles=${p.toggles} | sugg=${p.suggestions.map((x) => x.id + ":" + x.saves).join(",")}`);
}
const gm = getGraph("gmail")!;
for (const prof of [{ audience: "team" }, { audience: "public", scale: "small" }, {}] as any[]) {
  const p = plan(gm, { caps: ["read", "draft"], profile: prof });
  console.log("gmail read+draft", JSON.stringify(prof), p.lead, p.pole?.text, p.warnings.map((w) => w.text), p.suggestions.map((x) => `${x.label} (${x.saves})`));
}
const ig = getGraph("instagram")!;
console.log(plan(ig, { caps: ["publish"], profile: { audience: "public", scale: "large", business: false } }).lead);
console.log(plan(ig, { caps: ["publish"], profile: { audience: "public", scale: "large", business: true } }).lead);
