/* Run one live investigation from the CLI and print the event stream. Usage: npx tsx scripts/run-one.ts Calendly */
import { investigate } from "../lib/pipeline/run";
(async () => {
  for await (const ev of investigate(process.argv[2] || "Calendly", { budget: Number(process.env.BUDGET) || 60000 })) {
    if (ev.type === "graph") console.log("GRAPH", JSON.stringify({ caps: ev.graph.capabilities.map((c) => `${c.label}=${c.tier}`), gates: ev.graph.gates.map((g) => g.label), steps: ev.graph.steps.map((s) => `${s.title} ${s.wait}`), facts: ev.graph.facts.map((f) => `${f.id}:${f.status}`) }, null, 1));
    else if (ev.type === "trace") console.log("TRACE", ev.trace.ms + "ms", JSON.stringify(ev.trace.tokens), ev.trace.models, JSON.stringify(ev.trace.verifier), ev.trace.llm.map((c) => `${c.stage}:${c.ok ? "ok" : c.error}:${c.ms}ms`));
    else console.log(JSON.stringify(ev).slice(0, 300));
  }
})();
