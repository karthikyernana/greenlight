import type { Metadata } from "next";
import { getGraph, GRAPHS } from "@/lib/graph/load";
import { libraryIndex } from "@/lib/library";
import { getStored, isStale, recheckWaitMin } from "@/lib/store";
import { publishVerdict } from "@/lib/publish";
import Guide from "@/components/Guide";
import LiveGuide from "@/components/LiveGuide";
import { plan, defaultNeed } from "@/lib/engine";
import { canonicalSlug } from "@/lib/canonical";

/* Static + ISR. The 16 library guides are prerendered at build time and served from the CDN (and prefetched by the
   board), every other slug is rendered on first request and cached for a minute, so a newly stored guide shows up
   within 60 s. The page never reads searchParams on the server: the need (?need=&who=&scale=&biz=) and a live
   investigation's ?q=&cs= are read in the browser after hydration (Guide/LiveGuide `fromUrl`), which is what lets
   the HTML be cached at all. */
export const revalidate = 60;
export const dynamicParams = true;
export function generateStaticParams() {
  return GRAPHS.map((g) => ({ slug: g.slug }));
}

type Props = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const g = getGraph(slug) || (await getStored(slug))?.graph;
  if (!g) return { title: `${slug} · Greenlight` };
  const p = plan(g, defaultNeed(g), { suggestions: false });
  return { title: `${g.name}: ${p.live ? "live today" : p.wait} to real users · Greenlight`, description: `${p.lead} ${p.pole?.text || ""}`.trim() };
}

export default async function Page({ params }: Props) {
  const { slug } = await params;
  const g = getGraph(slug);
  if (g) return <Guide graph={g} publish={publishVerdict(g)} fromUrl />;
  // generated once, reused for everyone: a stored guide renders on the server with zero model calls
  const rec = await getStored(canonicalSlug(slug));
  if (rec) return <LiveGuide key={slug} slug={rec.slug} name={rec.graph.name} stored={{ graph: rec.graph, publish: rec.publish, storedAt: rec.storedAt, stale: isStale(rec), recheckInMin: recheckWaitMin(rec) }} />;
  const entry = libraryIndex().find((i) => i.slug === slug);
  const name = entry?.name || slug.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
  return <LiveGuide key={slug} slug={slug} name={name} q={entry?.name} composioSlug={entry?.composioSlug} />;
}
