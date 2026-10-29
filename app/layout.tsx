import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono, Instrument_Serif } from "next/font/google";
import Link from "next/link";
import "./globals.css";

const sans = Geist({ subsets: ["latin"], variable: "--font-geist-sans" });
const mono = Geist_Mono({ subsets: ["latin"], variable: "--font-geist-mono" });
const display = Instrument_Serif({ subsets: ["latin"], weight: "400", variable: "--font-instrument" });

export const metadata: Metadata = {
  metadataBase: new URL("https://oauth-greenlight.vercel.app"),
  title: "Greenlight: how long until your OAuth app can launch?",
  description: "Scope-aware OAuth app setup & approval guides for AI agent builders. Know the wait, start the slow parts today.",
};
export const viewport: Viewport = { themeColor: "#f5f3ee", width: "device-width", initialScale: 1 };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${sans.variable} ${mono.variable} ${display.variable}`}>
      <body className="min-h-screen">
        <header className="mx-auto flex max-w-6xl items-center justify-between px-5 py-5">
          <Link href="/" className="flex items-center gap-2.5">
            <Logo />
            <span className="text-[15px] font-semibold tracking-tight">Greenlight</span>
          </Link>
          <nav className="flex items-center gap-5 text-sm text-ink-2">
            <Link href="/#library" className="hover:text-ink">Library</Link>
            <Link href="/why" className="hover:text-ink">Why</Link>
            <a href="https://github.com/karthikyernana/greenlight" className="hover:text-ink" target="_blank" rel="noreferrer">GitHub</a>
          </nav>
        </header>
        {children}
        <footer className="mx-auto mt-24 max-w-6xl border-t hairline px-5 py-8 text-xs text-ink-3">
          Greenlight is a take-home prototype for Composio. Guides combine hand research, cited docs and live public probes. Nothing here is legal or provider advice. Check the sources before you submit.
        </footer>
      </body>
    </html>
  );
}

function Logo() {
  return (
    <svg width="22" height="22" viewBox="0 0 22 22" aria-hidden>
      <rect x="0.5" y="0.5" width="21" height="21" rx="6" fill="#16150f" />
      <circle cx="11" cy="6" r="2.2" fill="#3b3a33" />
      <circle cx="11" cy="11" r="2.2" fill="#3b3a33" />
      <circle cx="11" cy="16" r="2.4" fill="#3ddc84" />
    </svg>
  );
}
