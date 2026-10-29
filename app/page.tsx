import { libraryIndex } from "@/lib/library";
import Search from "@/components/Search";
import Library from "@/components/Library";

export default function Home() {
  const index = libraryIndex();
  const curated = index.filter((i) => i.curated);
  return (
    <main className="mx-auto max-w-6xl px-5">
      <section className="pt-10 pb-12 sm:pt-16">
        <p className="mb-5 inline-flex items-center gap-2 rounded-full border hairline bg-card px-3 py-1 text-xs text-ink-2">
          <span className="dot text-go" /> For developers shipping AI agents that connect to their users' apps
        </p>
        <h1 className="display max-w-3xl text-[44px] leading-[1.02] sm:text-[68px]">
          How long until your OAuth app can <em className="text-go">launch</em>?
        </h1>
        <p className="mt-5 max-w-2xl text-[17px] leading-relaxed text-ink-2">
          Getting a client ID takes minutes. <b className="font-medium text-ink">Approval</b> is the unpredictable part, and it depends on the scopes you ask for. Pick an app and what your agent needs. Greenlight shows the real wait, what blocks approval, what an agent can do for you, and which slow steps to start today.
        </p>
        <div className="mt-8 max-w-2xl">
          <Search index={index} />
        </div>
      </section>

      <Library index={index} curatedCount={curated.length} />
    </main>
  );
}
