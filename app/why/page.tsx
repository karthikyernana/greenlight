import Link from "next/link";

export const metadata = { title: "Why Greenlight · product memo" };

const H = ({ children }: { children: React.ReactNode }) => <h2 className="display mt-12 text-3xl">{children}</h2>;

export default function Why() {
  return (
    <main className="mx-auto max-w-2xl px-5 pb-10 text-[16.5px] leading-relaxed text-ink-2">
      <p className="text-sm text-ink-3">Product memo · Karthik Yernana · Composio APM (Integrations) take-home</p>
      <h1 className="display mt-2 text-5xl leading-[1.05] text-ink">The client ID isn't the hard part. Approval is.</h1>

      <H>The problem, sharpened</H>
      <p className="mt-3">A developer building an agent wants users to connect Gmail, Salesforce or LinkedIn. Any provider gives you a client ID in five minutes. What nobody can tell you up front is <b className="text-ink">whether you're one hour or eight weeks from real users</b>. That answer depends almost entirely on <b className="text-ink">which scopes you request</b>. Gmail sign-in is instant. Gmail read is a restricted scope that needs an annual third-party security assessment. LinkedIn posting is self-serve. LinkedIn company pages are partner-gated. Existing docs are organised by provider. The developer's real question is organised by <i>what my agent needs to do</i>.</p>

      <H>What I built</H>
      <ul className="mt-3 list-disc space-y-2 pl-5">
        <li><b className="text-ink">Scope-aware guides.</b> Pick capabilities (“read email”, “post as member”). Difficulty, time to approval, effort and steps all recalculate. The capability chip is the main control because it's the variable that actually decides the answer.</li>
        <li><b className="text-ink">Two plans, side by side.</b> <i>Launch today</i> (Composio-managed auth, testing-mode limits, ship the low-risk scopes first) and <i>Full approval</i>. Most teams need both: ship now, get approved in parallel.</li>
        <li><b className="text-ink">Start the clock today.</b> A critical-path schedule over the step graph puts the long provider-side waits (business verification, CASA, Marketplace review) up front, so they run while you build. The timeline separates your effort from time spent waiting on the provider.</li>
        <li><b className="text-ink">Agent vs you, per step.</b> What an agent can do (manifests, redirect URIs, privacy policy drafts, reviewer notes, screencast shot lists) versus what needs a human (legal entity docs, payment, identity, recording, clicking Submit). “Hand off to a coding agent” copies a prompt that does the agent half and stops at the human half.</li>
        <li><b className="text-ink">Honest evidence.</b> Every step is marked <i>Sourced</i> (cited doc), <i>Uncertain</i> (estimate), or backed by <i>Tested</i> live probes. Probes include OIDC discovery, a fake-client authorize call, and Composio's directory.</li>
        <li><b className="text-ink">Live generation for any app.</b> Type an unfamiliar name or URL. The agent checks Composio, researches the docs, probes the endpoints, reads the official pages and writes a guide in the same schema in about a minute. The guide gets a permanent share link.</li>
      </ul>

      <H>Scope I chose, and why</H>
      <p className="mt-3">Ten hand-researched guides chosen to span every kind of gate: <i>none</i> (GitHub, Notion), <i>install-count gates</i> (Slack, HubSpot), <i>trust/verification</i> (Microsoft, Google), <i>security review</i> (Google CASA, Salesforce AppExchange), <i>business verification + per-permission review</i> (Meta), <i>partner-only</i> (LinkedIn), and <i>money</i> (X's pay-per-use API). Plus 100 OAuth toolkits indexed from Composio's directory with live managed-auth status, each one click from a generated guide. I prioritised getting the decision right (how long, what blocks you, what to start now) over breadth, because a wrong timeline is worse than no guide.</p>

      <H>What I learned doing the research</H>
      <ul className="mt-3 list-disc space-y-2 pl-5">
        <li><b className="text-ink">The rules moved in 2026.</b> Salesforce stopped allowing new Connected Apps (Spring '26). X went pay-per-use with no free tier (Feb 2026). Slack raised its Marketplace bar to 10 active installs. HubSpot sunset legacy public apps. Static guides rot. Freshness checks are part of the product, not an afterthought.</li>
        <li><b className="text-ink">Many “approval” gates are really install caps.</b> HubSpot (25 installs before listing) and Slack (strict workspaces block unlisted apps) let you launch, then cap you. Developers find out at customer number 26.</li>
        <li><b className="text-ink">Composio-managed auth is the launch-today plan for 72 of the 100 OAuth toolkits</b>, but it has limits: unverified-app warnings (HubSpot, Slack), “Composio” shown as the actor (Notion), scope combinations it can't offer (LinkedIn), and apps it dropped (X). Guides say exactly when to bring your own app.</li>
        <li><b className="text-ink">Some providers are skipping the app registration step entirely.</b> Notion's MCP server advertises dynamic client registration (RFC 7591), and so does Salesforce's discovery document. For agents, the “create an OAuth app” step may disappear for some providers. Worth tracking.</li>
      </ul>

      <H>How it gets to 100 (and stays correct)</H>
      <ol className="mt-3 list-decimal space-y-2 pl-5">
        <li>Batch-generate the long tail with the same agent. Every guide shares one schema, so they're comparable and machine-checkable.</li>
        <li>Human spot-check before a generated guide counts as curated. Evidence badges show reviewers exactly what to verify.</li>
        <li>Freshness loop: re-run probes weekly, re-research monthly, and diff the claims. Flag guides whose sources changed (changelogs are the best signal).</li>
        <li>Close the loop with real outcomes: developers mark steps done and report actual review times, which replaces estimates with observed data.</li>
      </ol>

      <H>What I'd build next</H>
      <ul className="mt-3 list-disc space-y-2 pl-5">
        <li>Embed in the Composio dashboard: when a toolkit needs a custom auth config, show its guide inline, pre-filled with the right callback URL.</li>
        <li>Browser-agent autopilot for the agent-owned steps (create the client, set redirect URIs) with the user signed in and in control.</li>
        <li>Review-status tracking: a step marked “submitted” starts a countdown and nudges you when it's overdue, with a drafted follow-up to the provider.</li>
        <li>Aggregated, anonymised review-time data across developers. That's the dataset nobody has.</li>
      </ul>

      <H>Known limits</H>
      <p className="mt-3">Timelines are estimates unless a provider publishes them. Generated guides aren't human-reviewed, and the badge says so. Probes are unauthenticated by design (no apps were created in anyone's account). Generated guides persist in their share URL and on your device, not in a shared database yet.</p>

      <p className="mt-12"><Link href="/" className="rounded-xl bg-ink px-5 py-3 text-white">Try it →</Link></p>
    </main>
  );
}
