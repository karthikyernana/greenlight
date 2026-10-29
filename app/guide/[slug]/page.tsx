import type { Metadata } from "next";
import { getGuide, libraryIndex } from "@/lib/library";
import GuideView from "@/components/GuideView";
import SharedGuide from "@/components/SharedGuide";
import { headline } from "@/lib/plan";

type Props = { params: Promise<{ slug: string }>; searchParams: Promise<{ need?: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const g = getGuide(slug);
  if (!g) return { title: "Greenlight guide" };
  const h = headline(g);
  return { title: `${g.name} OAuth approval: ${h.difficulty.label}, ${h.wait} · Greenlight`, description: g.summary };
}

export default async function Page({ params, searchParams }: Props) {
  const { slug } = await params;
  const { need } = await searchParams;
  const g = getGuide(slug);
  if (g) return <GuideView guide={g} initialNeed={need?.split(",")} />;
  const entry = libraryIndex().find((i) => i.slug === slug);
  return <SharedGuide slug={slug} name={entry?.name || slug.replace(/-/g, " ")} need={need?.split(",")} />;
}
