"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { decompressFromEncodedURIComponent } from "lz-string";
import { Guide } from "@/lib/types";
import GuideView from "./GuideView";

/** Generated guides travel inside their share URL (#g=…), so links never die even without a database. */
export default function SharedGuide({ slug, name, need }: { slug: string; name: string; need?: string[] }) {
  const [g, setG] = useState<Guide | null>(null);
  const [state, setState] = useState<"loading" | "missing">("loading");
  useEffect(() => {
    try {
      const m = window.location.hash.match(/g=([^&]+)/);
      const raw = m ? decompressFromEncodedURIComponent(m[1]) : localStorage.getItem(`gl:guide:${slug}`);
      if (raw) {
        const p = Guide.safeParse(JSON.parse(raw));
        if (p.success) { setG(p.data); localStorage.setItem(`gl:guide:${p.data.slug}`, JSON.stringify(p.data)); return; }
      }
    } catch {}
    setState("missing");
  }, [slug]);
  if (g) return <GuideView guide={g} initialNeed={need} />;
  if (state === "loading") return <main className="mx-auto max-w-6xl px-5 py-20 text-ink-3">Opening guide…</main>;
  return (
    <main className="mx-auto max-w-2xl px-5 py-20 text-center">
      <h1 className="display text-5xl capitalize">{name}</h1>
      <p className="mt-4 text-ink-2">There's no ready guide for {name} yet. The agent can investigate it now: it searches the provider's docs, probes its OAuth endpoints and checks Composio's directory. Takes about a minute.</p>
      <Link href={`/generate?q=${encodeURIComponent(name)}&slug=${slug}`} className="mt-8 inline-flex rounded-xl bg-ink px-5 py-3 text-white hover:bg-ink-2">✦ Generate the {name} guide</Link>
    </main>
  );
}
