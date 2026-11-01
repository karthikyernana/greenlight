/* Shown the instant a guide link is clicked, while the route's payload (if not prefetched) streams in. */
export default function Loading() {
  return (
    <main data-route-loading="" className="mx-auto max-w-[1180px] px-4 pb-16 sm:px-6" aria-busy="true" aria-label="Loading guide">
      <div className="flex items-center gap-1.5 pt-5 text-[13px] text-ink-3"><span className="px-1">Apps</span><span aria-hidden>/</span><span className="skel inline-block h-3 w-20" /></div>
      <section className="pt-5 sm:pt-7">
        <div className="skel h-[34px] w-56 sm:h-[46px] sm:w-72" />
        <div className="skel mt-3 h-3 w-40" />
        <div className="skel mt-5 h-5 w-full max-w-[700px]" />
        <div className="skel mt-2 h-5 w-2/3 max-w-[520px]" />
      </section>
      <div className="mt-7 flex gap-2"><div className="skel h-8 w-36 !rounded-full" /><div className="skel h-8 w-28 !rounded-full" /><div className="skel h-8 w-40 !rounded-full" /></div>
      <div className="panel mt-5 h-[260px] p-5"><div className="skel h-6 w-1/3" /><div className="skel mt-6 h-3 w-full" /><div className="skel mt-4 h-3 w-5/6" /><div className="skel mt-4 h-3 w-2/3" /></div>
    </main>
  );
}
