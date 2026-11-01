import type { Metadata, Viewport } from "next";
import { Host_Grotesk, JetBrains_Mono } from "next/font/google";
import Link from "next/link";
import { libraryIndex, intentIndex } from "@/lib/library";
import HeaderBar from "@/components/HeaderBar";
import "./globals.css";

const host = Host_Grotesk({ subsets: ["latin"], variable: "--font-host", display: "swap" });
const jet = JetBrains_Mono({ subsets: ["latin"], variable: "--font-jet", display: "swap" });

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL || "https://oauth-greenlight-v2.vercel.app"),
  title: "Greenlight: how long until your agent's users can connect",
  description: "Say what your agent needs. Greenlight works out your path from today to real users connecting, from verified facts, and hands you the pieces an agent can prepare.",
};
export const viewport: Viewport = { themeColor: "#f5f5f2", width: "device-width", initialScale: 1 };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  const index = libraryIndex();
  return (
    <html lang="en" className={`${host.variable} ${jet.variable}`}>
      <body className="min-h-screen">
        <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:left-2 focus:top-2 focus:z-50 focus:bg-surface focus:px-3 focus:py-1">Skip to content</a>
        <header className="border-b rule bg-paper/95 backdrop-blur-[2px] sticky top-0 z-30">
          <div className="mx-auto flex h-14 max-w-[1240px] items-center gap-4 px-4 sm:px-6">
            <Link href="/" className="flex shrink-0 items-center gap-2" aria-label="Greenlight home">
              <Lamp />
              <span className="text-[15px] font-semibold tracking-[-0.01em]">Greenlight</span>
            </Link>
            <HeaderBar index={index} intents={intentIndex()} />
            <nav className="ml-auto flex shrink-0 items-center gap-4 text-[13px] text-ink-2">
              <span className="label hidden md:inline num">{index.length} apps</span>
              <a href="https://github.com/karthikyernana/greenlight/tree/v3#readme" className="hover:text-ink" target="_blank" rel="noreferrer">README</a>
            </nav>
          </div>
        </header>
        <div id="main">{children}</div>
        <footer className="mx-auto mt-20 max-w-[1240px] border-t rule px-4 py-6 sm:px-6">
          <p className="label !normal-case !tracking-normal leading-relaxed">
            Greenlight v3 · a take-home prototype for Composio. Plans come from hand research, quoted docs and live public probes. Not provider or legal advice: check the sources before you submit.
          </p>
        </footer>
      </body>
    </html>
  );
}

/** Three-aspect signal: two dark lamps, the bottom one lit in signal orange. */
function Lamp() {
  return (
    <svg width="14" height="22" viewBox="0 0 14 22" aria-hidden>
      <rect x="0.5" y="0.5" width="13" height="21" rx="1.5" fill="#0f0f0d" />
      <circle cx="7" cy="5" r="2.2" fill="#3a3a35" />
      <circle cx="7" cy="11" r="2.2" fill="#3a3a35" />
      <circle cx="7" cy="17" r="2.4" fill="#ff4f00" />
    </svg>
  );
}
