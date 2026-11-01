/* Every investigation writes a trace: stages, tool calls, timings, tokens. Small on purpose (no page bodies). */
import type { CallRecord } from "../llm";
import type { Decision } from "../jev";

export type ToolCall = { stage: string; kind: "search" | "fetch" | "probe" | "llm" | "verify" | "jev"; target: string; ms: number; ok: boolean; note?: string; via?: string };
export type StageRec = { id: string; label: string; status: "running" | "done" | "warn" | "skipped"; ms: number; detail?: string };
export type Trace = {
  id: string; q: string; app: string; startedAt: string; ms: number;
  stages: StageRec[]; tools: ToolCall[]; llm: CallRecord[];
  tokens: { prompt: number; completion: number; budget: number };
  models: string[]; outcome: "ok" | "partial" | "failed"; error?: string;
  verifier: { checked: number; quoteMatched: number; downgraded: number; corrected: number; recheckRounds: number; criticIssues: number; unresolved?: number; jevChecked?: number; jevRejected?: number };
  /** Typed decisions and which engine made each (Jev with its probability, the LLM, rules, or code). Optional for old traces. */
  decisions?: Decision[];
  retrieval?: { firecrawl: boolean; firecrawlPages: number; jina: string };
};

export function newTraceId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

const g = globalThis as unknown as { __glTraces?: Map<string, Trace> };
const store = (g.__glTraces ??= new Map<string, Trace>());
export function saveTrace(t: Trace) {
  store.set(t.id, t);
  if (store.size > 200) store.delete(store.keys().next().value as string);
}
export function getTrace(id: string) {
  return store.get(id);
}
