"use client";
import { useEffect, useRef, useState } from "react";

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

/**
 * Text whose numbers count from their previous values to the new ones (~250ms, ease-out).
 * "5w–2mo" → "2w–3w" animates both numbers; if the shape changes it simply swaps.
 */
export function CountText({ value, className = "", ms = 260 }: { value: string; className?: string; ms?: number }) {
  const reduced = useReducedMotion();
  const [shown, setShown] = useState(value);
  const prev = useRef(value);
  useEffect(() => {
    const from = prev.current;
    prev.current = value;
    const a = from.match(/\d+(\.\d+)?/g) || [];
    const b = value.match(/\d+(\.\d+)?/g) || [];
    const shape = (s: string) => s.replace(/\d+(\.\d+)?/g, "#");
    if (reduced || from === value || a.length !== b.length || shape(from) !== shape(value)) { setShown(value); return; }
    let raf = 0;
    const t0 = performance.now();
    const tick = (t: number) => {
      const k = Math.min(1, (t - t0) / ms);
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
  }, [value, reduced, ms]);
  return <span className={`num ${className}`}>{shown}</span>;
}
