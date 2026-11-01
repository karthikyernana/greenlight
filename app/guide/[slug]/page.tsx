import type { Metadata } from "next";
import { getGraph } from "@/lib/graph/load";
import { libraryIndex } from "@/lib/library";
import Guide from "@/components/Guide";
import LiveGuide from "@/components/LiveGuide";
import { plan, defaultNeed, cleanCaps } from "@/lib/engine";
import { parseNeed, parseProfile } from "@/lib/urlstate";

type SP = { need?: string; q?: string; cs?: string; who?: string; scale?: string; biz?: string };
type Props = { params: Promise<{ slug: string }>; searchParams: Promise<SP> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const g = getGraph(slug);
  if (!g) return { title: `${slug} · Greenlight` };
  const p = plan(g, defaultNeed(g), { suggestions: false });
  return { title: `${g.name}: ${p.live ? "live today" : p.wait} to real users · Greenlight`, description: `${p.lead} ${p.pole?.text || ""}`.trim() };
}

export default async function Page({ params, searchParams }: Props) {
  const { slug } = await params;
  const sp = await searchParams;
  const caps = parseNeed(sp.need);
  const profile = parseProfile(sp);
  const g = getGraph(slug);
  if (g) return <Guide graph={g} initialNeed={{ caps: cleanCaps(g, caps), profile }} />;
  const entry = libraryIndex().find((i) => i.slug === slug);
  const name = sp.q?.trim() || entry?.name || slug.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
  return <LiveGuide key={slug} slug={slug} name={name} q={sp.q || entry?.name} composioSlug={sp.cs || entry?.composioSlug} caps={caps} profile={profile} />;
}
