import { redirect } from "next/navigation";
import { slugify } from "@/lib/urlstate";

/** v1 URL. Live generation now happens in place on /guide/<slug>. */
export default async function Page({ searchParams }: { searchParams: Promise<{ q?: string; slug?: string }> }) {
  const { q = "", slug } = await searchParams;
  if (!q.trim()) redirect("/");
  redirect(`/guide/${slug || slugify(q)}?q=${encodeURIComponent(q)}`);
}
