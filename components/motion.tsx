"use client";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { springOf, type SpringName } from "@/lib/spring";

/* Motion primitives. Everything animates transform / opacity / height through the Web Animations API with
   spring easings (lib/spring.ts). Nothing runs when the user prefers reduced motion. */

const useIso = typeof window === "undefined" ? useEffect : useLayoutEffect;

export const calm = () => typeof window === "undefined" || window.matchMedia("(prefers-reduced-motion: reduce)").matches || !Element.prototype.animate;

export function useReducedMotion() {
  const [r, setR] = useState(false);
  useEffect(() => {
    const m = window.matchMedia("(prefers-reduced-motion: reduce)");
    setR(m.matches);
    const on = () => setR(m.matches);
    m.addEventListener("change", on);
    return () => m.removeEventListener("change", on);
  }, []);
  return r;
}

export function animate(el: Element | null, frames: Keyframe[], preset: SpringName = "gentle", opts: KeyframeAnimationOptions = {}) {
  if (!el || calm()) return null;
  const s = springOf(preset);
  return el.animate(frames, { duration: s.duration, easing: s.easing, fill: "backwards", ...opts });
}

/**
 * FLIP for keyed children: every element under `root` with data-flip="<key>" that moved between renders glides
 * from its old position; new ones fade/rise in (staggered, max 6); removed ones simply leave (no ghosts: calm).
 * Call with the values that change the layout.
 */
export function useFlip(root: React.RefObject<HTMLElement | null>, deps: unknown[]) {
  const prev = useRef<Map<string, DOMRect>>(new Map());
  const first = useRef(true);
  useIso(() => {
    const el = root.current;
    if (!el) return;
    const now = new Map<string, { el: HTMLElement; r: DOMRect }>();
    el.querySelectorAll<HTMLElement>("[data-flip]").forEach((n) => now.set(n.dataset.flip!, { el: n, r: n.getBoundingClientRect() }));
    if (!first.current && !calm()) {
      let entered = 0;
      for (const [k, n] of now) {
        const o = prev.current.get(k);
        const vis = n.r.bottom > -40 && n.r.top < window.innerHeight + 40;
        if (!o) {
          if (vis && entered < 8) animate(n.el, [{ opacity: 0, transform: "translateY(6px)" }, { opacity: 1, transform: "none" }], "gentle", { delay: Math.min(entered++, 6) * 22 });
          continue;
        }
        const dx = o.left - n.r.left, dy = o.top - n.r.top;
        if (Math.abs(dx) + Math.abs(dy) < 0.75 || !vis) continue;
        animate(n.el, [{ transform: `translate(${dx}px, ${dy}px)` }, { transform: "none" }], "snappy");
      }
    }
    first.current = false;
    prev.current = new Map([...now].map(([k, v]) => [k, v.r]));
  }, deps); // eslint-disable-line react-hooks/exhaustive-deps
}

/** Height-animated disclosure body. Content stays mounted after first open so FLIP and state survive. */
export function Collapse({ open, children, id, className = "" }: { open: boolean; children: React.ReactNode; id?: string; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const [mounted, setMounted] = useState(open);
  const was = useRef(open);
  useEffect(() => { if (open) setMounted(true); }, [open]);
  useIso(() => {
    const el = ref.current;
    if (!el || was.current === open) return;
    was.current = open;
    if (calm()) { el.style.height = open ? "" : "0px"; return; }
    const full = el.scrollHeight;
    el.style.overflow = "hidden";
    const a = animate(el, open ? [{ height: "0px", opacity: 0 }, { height: `${full}px`, opacity: 1 }] : [{ height: `${full}px`, opacity: 1 }, { height: "0px", opacity: 0 }], "gentle", { fill: "forwards" });
    if (!a) return;
    a.onfinish = () => { a.cancel(); el.style.height = open ? "" : "0px"; el.style.overflow = open ? "" : "hidden"; };
  }, [open, mounted]);
  return (
    <div ref={ref} id={id} className={className} style={open ? undefined : { height: 0, overflow: "hidden" }} aria-hidden={!open} inert={!open ? true : undefined}>
      {mounted ? children : null}
    </div>
  );
}

/**
 * Text whose numbers glide from their previous values to the new ones on a spring.
 * "5w–2mo" → "2w–3w" animates both numbers; if the shape changes it simply swaps (with a short cross-fade).
 */
export function CountText({ value, className = "" }: { value: string; className?: string }) {
  const reduced = useReducedMotion();
  const [shown, setShown] = useState(value);
  const prev = useRef(value);
  const span = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    const from = prev.current;
    prev.current = value;
    const a = from.match(/\d+(\.\d+)?/g) || [];
    const b = value.match(/\d+(\.\d+)?/g) || [];
    const shape = (s: string) => s.replace(/\d+(\.\d+)?/g, "#");
    if (from === value) return;
    if (reduced || a.length !== b.length || shape(from) !== shape(value)) {
      setShown(value);
      animate(span.current, [{ opacity: 0.2, transform: "translateY(3px)" }, { opacity: 1, transform: "none" }], "snappy");
      return;
    }
    const s = springOf("gentle");
    let raf = 0;
    const t0 = performance.now();
    const tick = (t: number) => {
      const k = Math.min(1, (t - t0) / s.duration);
      const e = 1 - Math.pow(1 - k, 3);
      let i = 0;
      setShown(value.replace(/\d+(\.\d+)?/g, (m) => {
        const x = Number(a[i]), y = Number(m);
        i++;
        const v = x + (y - x) * e;
        return m.includes(".") ? v.toFixed(1) : String(Math.round(v));
      }));
      if (k < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [value, reduced]);
  return <span ref={span} className={`num inline-block ${className}`}>{shown}</span>;
}

/** Shared-element navigation: name the source element, start a view transition, navigate, end when the target exists. */
export function navigateWithTransition(go: () => void, source?: HTMLElement | null, name = "app-title") {
  const d = document as Document & { startViewTransition?: (cb: () => Promise<void> | void) => unknown };
  if (!d.startViewTransition || calm()) { go(); return; }
  if (source) source.style.viewTransitionName = name;
  d.startViewTransition(async () => {
    if (source) source.style.viewTransitionName = "";
    go();
    const t0 = Date.now();
    await new Promise<void>((res) => {
      const check = () => (document.querySelector(`[data-vt="${name}"]`) || Date.now() - t0 > 900 ? res() : requestAnimationFrame(check));
      check();
    });
  });
}
