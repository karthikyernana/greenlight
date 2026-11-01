/* Deterministic stand-in for investigate(), for integration and end-to-end tests only.
   Enabled when GREENLIGHT_FAKE_PIPELINE=1 (never set on the deployment). No network, no model:
   it streams the same event shapes as the real pipeline with short delays, then a valid graph and trace. */
import type { PipeEvent } from "./run";
import { GRAPHS } from "../graph/load";
import { newTraceId, saveTrace, type Trace } from "./trace";
import { canonicalSlug } from "../canonical";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function* fakeInvestigate(q: string, opts: { stepMs?: number; fail?: boolean } = {}): AsyncGenerator<PipeEvent> {
  const ms = opts.stepMs ?? Number(process.env.GREENLIGHT_FAKE_STEP_MS || 120);
  const name = q.trim().replace(/\b\w/g, (c) => c.toUpperCase());
  const base = structuredClone(GRAPHS.find((g) => g.slug === "dropbox")!);
  const id = newTraceId();
  const lanes = ["scout", "scopes", "gates", "probe", "verify"] as const;
  for (const lane of lanes) {
    yield { type: "stage", id: lane, status: "running", detail: `fake ${lane}` };
    await sleep(ms);
    yield { type: "fact", stage: lane, id: `${lane}-1`, claim: `${name}: ${lane} finding`, status: lane === "probe" ? "tested" : "sourced", url: "https://example.com/docs" };
    if ((opts.fail || /__fail/.test(q)) && lane === "scopes") { yield { type: "error", code: "model_down", message: "The model didn't return a usable answer (fake failure)." }; return; }
    if (lane === "verify") yield { type: "correction", id: "gates-1", claim: `${name}: gates finding`, from: "sourced", to: "uncertain", reason: "quote not found in source" };
    yield { type: "stage", id: lane, status: "done", detail: `fake ${lane} done`, ms };
  }
  const graph = { ...base, slug: canonicalSlug(q), name, domain: `${canonicalSlug(q)}.example`, origin: "generated" as const, traceId: id, model: "fake" };
  yield { type: "graph", graph };
  const trace: Trace = {
    id, q, app: name, startedAt: new Date().toISOString(), ms: ms * 5, stages: lanes.map((l) => ({ id: l, label: l, status: "done", ms })), tools: [{ stage: "scout", kind: "fetch", target: "https://example.com/docs", ms: 5, ok: true, via: "fake" }],
    llm: [{ stage: "scopes", provider: "fake", model: "fake", ms: 5, prompt: 10, completion: 10, ok: true }], tokens: { prompt: 10, completion: 10, budget: 1000 }, models: ["fake:fake"], outcome: "ok",
    verifier: { checked: 5, quoteMatched: 4, downgraded: 1, corrected: 0, recheckRounds: 0, criticIssues: 0, unresolved: 0 }, decisions: [],
  };
  saveTrace(trace);
  yield { type: "trace", trace };
}
