import type { Metadata, Viewport } from "next";
import { jevConfigured } from "@/lib/jev";
import { Host_Grotesk, JetBrains_Mono } from "next/font/google";
import { libraryIndex, intentIndex } from "@/lib/library";
import { springCssVars } from "@/lib/spring";
import HeaderBar from "@/components/HeaderBar";
import TopBar from "@/components/TopBar";
import "./globals.css";

const host = Host_Grotesk({ subsets: ["latin"], variable: "--font-host", display: "swap" });
const jet = JetBrains_Mono({ subsets: ["latin"], variable: "--font-jet", display: "swap" });

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL || "https://oauth-greenlight-v2.vercel.app"),
  title: "Greenlight: how long until your agent's users can connect",
  description: "Say what your agent needs. Greenlight works out your path from today to real users connecting, from verified facts, and hands you the pieces an agent can prepare.",
};
export const viewport: Viewport = { themeColor: "#f3f4f1", width: "device-width", initialScale: 1 };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  const index = libraryIndex();
  return (
    <html lang="en" className={`${host.variable} ${jet.variable}`} style={springCssVars() as React.CSSProperties}>
      <body>
        <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:left-2 focus:top-2 focus:z-50 focus:rounded-md focus:bg-surface focus:px-3 focus:py-1">Skip to content</a>
        <TopBar count={index.length}>
          <HeaderBar index={index} intents={intentIndex()} jev={jevConfigured()} />
        </TopBar>
        <div id="main">{children}</div>
        <footer className="mx-auto mt-16 max-w-[1180px] px-4 pb-24 sm:px-6 lg:pb-10">
          <p className="border-t rule pt-5 text-[12.5px] leading-relaxed text-ink-3">
            Greenlight v4 · a prototype for Composio. Plans come from hand research, quoted docs and live public probes; agent-generated guides are labelled Draft until every automatic check passes. Not provider or legal advice: check the sources before you submit.
          </p>
        </footer>
      </body>
    </html>
  );
}
