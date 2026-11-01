"use client";
import { useEffect, useRef, useState } from "react";

/* Plain-language definitions for the jargon that shows up in plans. Hover or focus a dotted word to read it. */
export const GLOSSARY: Record<string, string> = {
  CASA: "Cloud Application Security Assessment. A lab Google approves tests your app against an OWASP-based checklist. Needed for restricted Gmail and Drive scopes, every 12 months.",
  scope: "A permission your app asks the user for, like “read email”. Providers review the risky ones before strangers can grant them.",
  scopes: "Permissions your app asks the user for, like “read email”. Providers review the risky ones before strangers can grant them.",
  DCR: "Dynamic client registration (RFC 7591): the provider lets software register an OAuth client by API, with no console form.",
  sensitive: "A scope the provider reviews before the public can grant it. Usually days to two weeks.",
  restricted: "The riskiest scopes. Review plus a security assessment or business checks. Usually weeks.",
  "Publisher verification": "Microsoft confirms the company behind an app is real (via its Partner Program). Without it, users in other organisations often can't consent.",
  "Business verification": "The provider checks your legal business documents. Individuals can't pass it.",
  "critical path": "The chain of steps that sets the finish date. Shortening anything else doesn't move it.",
  "Composio-managed": "Composio has its own approved OAuth app for this provider. Your users connect through it today, but see Composio on the consent screen.",
  "redirect URI": "Where the provider sends the user back after they approve. It must match what you registered, character for character.",
  "Testing mode": "A Google Cloud setting where only listed test users can sign in. Their refresh tokens expire after 7 days.",
};

export default function Term({ t, children }: { t: keyof typeof GLOSSARY | string; children?: React.ReactNode }) {
  const def = GLOSSARY[t];
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false); };
    window.addEventListener("mousedown", close);
    return () => window.removeEventListener("mousedown", close);
  }, [open]);
  if (!def) return <>{children ?? t}</>;
  return (
    <span ref={ref} className="term relative" onMouseEnter={() => setOpen(true)} onMouseLeave={() => setOpen(false)}>
      <button type="button" className="term-word" aria-expanded={open} onFocus={() => setOpen(true)} onBlur={() => setOpen(false)} onClick={() => setOpen((o) => !o)}>
        {children ?? t}
      </button>
      {open && <span role="tooltip" className="tip">{def}</span>}
    </span>
  );
}

/** Wrap known terms inside a sentence. */
export function WithTerms({ text }: { text: string }) {
  const keys = ["CASA", "Publisher verification", "Business verification", "critical path", "redirect URI", "DCR"];
  const re = new RegExp(`(${keys.map((k) => k.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|")})`, "g");
  const parts = text.split(re);
  return <>{parts.map((p, i) => (keys.includes(p) ? <Term key={i} t={p} /> : <span key={i}>{p}</span>))}</>;
}
