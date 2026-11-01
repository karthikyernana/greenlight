"use client";
import { useEffect, useRef } from "react";
import Link from "next/link";

/** Sticky header. Transparent at the top of the page; once content scrolls under it, it turns to glass with a hairline. */
export default function TopBar({ children, count }: { children: React.ReactNode; count: number }) {
  const ref = useRef<HTMLElement>(null);
  useEffect(() => {
    let raf = 0;
    const on = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => ref.current?.setAttribute("data-scrolled", String(window.scrollY > 4)));
    };
    on();
    window.addEventListener("scroll", on, { passive: true });
    return () => { window.removeEventListener("scroll", on); cancelAnimationFrame(raf); };
  }, []);
  return (
    <header ref={ref} className="topbar" data-scrolled="false">
      <div className="topbar-inner mx-auto flex h-14 max-w-[1180px] items-center gap-3 px-4 sm:gap-5 sm:px-6">
        <Link href="/" className="flex shrink-0 items-center gap-2.5 rounded-md" aria-label="Greenlight home">
          <Lamp />
          <span className="text-[15px] font-semibold tracking-[-0.01em]">Greenlight</span>
        </Link>
        {children}
        <nav className="ml-auto flex shrink-0 items-center gap-1 text-[13px] text-ink-2">
          <span className="label mr-2 hidden md:inline num">{count} apps</span>
          <a href="https://github.com/karthikyernana/greenlight/tree/v4#readme" className="btn btn-quiet h-8 px-2.5 text-[13px]" target="_blank" rel="noreferrer">README</a>
        </nav>
      </div>
    </header>
  );
}

/** Three-aspect signal: two dark lamps, the bottom one lit in signal orange. */
function Lamp() {
  return (
    <svg width="14" height="22" viewBox="0 0 14 22" aria-hidden>
      <rect x="0.5" y="0.5" width="13" height="21" rx="3" fill="#111412" />
      <circle cx="7" cy="5" r="2.2" fill="#3a3f3c" />
      <circle cx="7" cy="11" r="2.2" fill="#3a3f3c" />
      <circle cx="7" cy="17" r="2.4" fill="#ff4f00" />
    </svg>
  );
}
