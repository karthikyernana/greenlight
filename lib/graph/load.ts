import { ProviderGraph } from "./schema";
import { RAW_GRAPHS } from "./all";

export const GRAPHS: ProviderGraph[] = RAW_GRAPHS.map((g) => ProviderGraph.parse(g));

const g = globalThis as unknown as { __glGraphs?: Map<string, ProviderGraph> };
const cache = (g.__glGraphs ??= new Map<string, ProviderGraph>());

export function getGraph(slug: string): ProviderGraph | undefined {
  return GRAPHS.find((x) => x.slug === slug) || cache.get(slug);
}
export function putGraph(gr: ProviderGraph) {
  cache.set(gr.slug, gr);
}
export const GOLDEN = GRAPHS.filter((x) => x.origin === "curated").map((x) => x.slug);

export { graphToGuide, graphSources } from "./adapt";
