import type { Metadata } from "next";
import { getGuide, libraryIndex } from "@/lib/library";
import GuideView from "@/components/GuideView";
import LiveGuide from "@/components/LiveGuide";
import { headline, verdict, defaultSelection } from "@/lib/plan";
import { parseNeed } from "@/lib/urlstate";

type Props = { params: Promise<{ slug: string }>; searchParams: Promise<{ need?: string; q?: string; cs?: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const g = getGuide(slug);
  if (!g) return { title: `${slug} · Greenlight` };
  const h = headline(g);
  const v = verdict(g, defaultSelection(g));
  return { title: `${g.name}: ${h.wait} to OAuth approval · Greenlight`, description: `${v.lead} ${v.pole || ""} ${g.summary}`.trim() };
}

export default async function Page({ params, searchParams }: Props) {
  const { slug } = await params;
  const { need, q, cs } = await searchParams;
  const g = getGuide(slug);
  if (g) return <GuideView guide={g} initialNeed={parseNeed(need)} />;
  const entry = libraryIndex().find((i) => i.slug === slug);
  const name = q?.trim() || entry?.name || slug.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
  return <LiveGuide key={slug} slug={slug} name={name} q={q || entry?.name} composioSlug={cs || entry?.composioSlug} need={parseNeed(need)} />;
}
