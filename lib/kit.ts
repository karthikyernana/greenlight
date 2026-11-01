import type { Guide, Step } from "./types";
import { activeSteps, headline, TIER_META, startToday, fmtEffort } from "./plan";

/**
 * The setup kit: artifacts an agent can produce right now from the guide + the selected capabilities.
 * Deterministic (no model call), so it works on every deployment, instantly.
 */
export const COMPOSIO_CALLBACK = "https://backend.composio.dev/api/v3/toolkits/auth/callback";
export const COMPOSIO_LEGACY_CALLBACK = "https://backend.composio.dev/api/v1/auth-apps/add";

export type KitItem = { id: string; title: string; hint: string; body: string; lang?: "text" | "md" | "json" };

const REVIEW_TIERS = new Set(["review", "restricted", "partner"]);

export function buildKit(g: Guide, sel: string[], shareUrl?: string, planned?: { steps: Step[]; wait: string }): KitItem[] {
  const caps = g.capabilities.filter((c) => sel.includes(c.id));
  const steps = planned?.steps || activeSteps(g, sel);
  const h = { ...headline(g, sel), ...(planned ? { wait: planned.wait } : {}) };
  const reviewed = caps.filter((c) => REVIEW_TIERS.has(c.tier));
  const isGoogle = /google/i.test(g.domain) || /gmail|google/i.test(g.slug);
  const isMeta = /instagram|facebook|meta/i.test(g.slug + g.domain);
  const scopes = [...new Set(caps.flatMap((c) => c.scopes.filter((s) => !s.startsWith("("))))];
  const pseudo = caps.flatMap((c) => c.scopes.filter((s) => s.startsWith("(")));
  const items: KitItem[] = [];

  items.push({
    id: "redirects",
    title: "Redirect URIs",
    hint: "Paste into the provider console. They must match character for character.",
    lang: "text",
    body: [
      `# Composio bring-your-own-app (set the same value as oauth_redirect_uri in your Composio auth config)`,
      COMPOSIO_CALLBACK,
      ``,
      `# Your own app (replace the host)`,
      `https://app.example.com/api/auth/callback/${g.slug}`,
      `http://localhost:3000/api/auth/callback/${g.slug}   # dev only; drop it before review, some providers reject http`,
      ``,
      `# Note: some Composio toolkit defaults still use ${COMPOSIO_LEGACY_CALLBACK}.`,
      `# Either works if the provider console and the auth config agree. Mismatch = redirect_uri_mismatch.`,
    ].join("\n"),
  });

  items.push({
    id: "scopes",
    title: "Scope list",
    hint: `Least privilege for: ${caps.map((c) => c.label).join(", ")}.`,
    lang: "text",
    body: [
      scopes.length ? scopes.join(" ") : "(this provider has no scope strings for these capabilities)",
      ...(pseudo.length ? ["", "# Set in the console, not as scope strings:", ...pseudo.map((p) => `#   ${p.replace(/[()]/g, "")}`)] : []),
      "",
      ...caps.map((c) => `# ${c.label} → ${TIER_META[c.tier].label}: ${c.why}`),
      ...g.capabilities.filter((c) => !sel.includes(c.id)).map((c) => `# NOT requested: ${c.label} (${TIER_META[c.tier].label}). Adding it later can re-trigger review.`),
    ].join("\n"),
  });

  if (reviewed.length) {
    items.push({
      id: "justification",
      title: "Scope justification",
      hint: "Draft for the review form. Replace the bracketed parts with your product's real flow.",
      lang: "text",
      body: reviewed
        .map((c) => {
          const sc = c.scopes.filter((s) => !s.startsWith("(")).join(", ") || c.label;
          return [
            `${sc} (${c.label})`,
            ``,
            `[Product] is an AI agent that ${c.label.toLowerCase()} on the user's behalf, only after the user connects their ${g.name} account and asks the agent to act. ` +
              `We request ${sc} because [specific feature, e.g. "summarising the user's unread threads each morning"] cannot work with a narrower permission: [why narrower scopes fall short]. ` +
              `Data is fetched on demand, shown only to the user who connected it, stored encrypted at rest for [N days], and deleted when the user disconnects. ` +
              (isGoogle
                ? `Our use of information received from Google APIs adheres to the Google API Services User Data Policy, including the Limited Use requirements. We do not use this data to train generalised AI/ML models.`
                : `We do not sell this data or use it to train generalised AI models.`),
          ].join("\n");
        })
        .join("\n\n"),
    });
  }

  const privacy: string[] = [
    "Hosted on your own domain, publicly reachable, not behind a login",
    `Names ${g.name} as a data source and lists what you access: ${caps.map((c) => c.label.toLowerCase()).join(", ")}`,
    "Says exactly how the data is used by the agent, and that a human user triggers each action",
    "Retention period, encryption at rest, and where data is processed (including LLM providers you send it to)",
    "Whether data is used to train models (say no, unless you truly do and the provider allows it)",
    "How a user disconnects, revokes access, and requests deletion (with a contact email)",
    "Same company name and domain as the consent screen / app listing",
  ];
  if (isGoogle) privacy.push("Google API Services User Data Policy + Limited Use disclosure, verbatim, on the same page");
  if (isMeta) privacy.push("Data deletion callback URL or a public deletion-instructions page (Meta requires one)");
  for (const r of g.rejections) if (/privacy|support|login|homepage/i.test(r)) privacy.push(`Avoid: ${r}`);
  items.push({
    id: "privacy",
    title: "Privacy policy checklist",
    hint: "Reviewers reject on these more than anything else.",
    lang: "md",
    body: privacy.map((p) => `- [ ] ${p}`).join("\n"),
  });

  const needsVideo = steps.some((s) => /video|screencast|record/i.test(s.title + s.detail));
  if (needsVideo) {
    items.push({
      id: "video",
      title: "Demo video shot list",
      hint: "An agent can't record your screen, but it can script it.",
      lang: "md",
      body: [
        "1. Your homepage on the verified domain (URL bar visible). One sentence on what the agent does.",
        `2. Click "Connect ${g.name}". Show the ${g.name} consent screen with the client ID visible in the URL bar.`,
        ...caps.map((c, i) => `${i + 3}. ${c.label}: trigger it in your UI and show the result. Say which scope it uses (${c.scopes.filter((s) => !s.startsWith("(")).join(", ") || "n/a"}).`),
        `${caps.length + 3}. Show how a user disconnects and deletes their data.`,
        "Keep it under 5 minutes, English UI, unlisted YouTube link.",
      ].join("\n"),
    });
  }

  const qs = g.uncertain.slice(0, 3);
  items.push({
    id: "email",
    title: "Email to the provider",
    hint: "Ask the questions the docs don't answer before you submit, not after a rejection.",
    lang: "text",
    body: `Subject: Pre-submission questions: OAuth app for an AI agent (${caps.map((c) => c.label).join(", ")})

Hi ${g.name} developer support,

We're building an AI agent that lets users connect their ${g.name} accounts via OAuth to ${caps.map((c) => c.label.toLowerCase()).join(" and ")}. Before we submit for review:

${[
  ...qs.map((x) => `Our understanding: "${x.replace(/\.$/, "")}". Is that still accurate?`),
  "What is the current typical review time for an app requesting these permissions?",
  "Is there anything we can prepare now (documents, demo video, reviewer test account) to avoid a second round?",
].map((x, i) => `${i + 1}. ${x}`).join("\n")}

Reviewer test account: [email / password or test workspace]
Demo video: [unlisted link]

Thanks,
[name], [company], [domain]`,
  });

  const payload = {
    provider: g.name,
    register_at: g.console,
    app_type: g.appType,
    capabilities: caps.map((c) => ({ label: c.label, scopes: c.scopes, tier: c.tier })),
    redirect_uris: [COMPOSIO_CALLBACK, `https://app.example.com/api/auth/callback/${g.slug}`],
    expected_time_to_live: h.wait,
    start_today: startToday(steps).map((s) => s.title),
    your_tasks: steps.filter((s) => s.owner !== "you").map((s) => ({ step: s.title, do: s.agent || s.detail.replace(/\*\*/g, ""), link: s.link })),
    stop_and_hand_back: steps.filter((s) => s.owner !== "agent").map((s) => ({ step: s.title, human: s.human || s.detail.replace(/\*\*/g, "") })),
    sources: g.sources.map((s) => s.url),
  };
  items.push({
    id: "agent",
    title: "Coding-agent handoff",
    hint: "Paste into Claude Code, Cursor or a browser agent. It does the agent half and stops at the human half.",
    lang: "md",
    body: `You are helping me register an OAuth app with ${g.name} and get it approved so my AI agent's users can connect their ${g.name} accounts.
Do every item in "your_tasks" that can be done from code or docs: configs, manifests, redirect URIs, privacy policy and terms drafts, reviewer notes, test scripts.
When you reach anything in "stop_and_hand_back" (signing in, legal or business documents, payment, identity checks, recording video, clicking Submit), STOP, tell me exactly what to do, and wait.
Never submit for review or pay on my behalf. Cite the source URL for every requirement you rely on.${shareUrl ? `\nLive guide: ${shareUrl}` : ""}

\`\`\`json
${JSON.stringify(payload, null, 2)}
\`\`\``,
  });

  return items;
}

export function kitMarkdown(g: Guide, sel: string[], shareUrl?: string, planned?: { steps: Step[]; wait: string }): string {
  const h = { ...headline(g, sel), ...(planned ? { wait: planned.wait } : {}) };
  const steps = planned?.steps || activeSteps(g, sel);
  const kit = buildKit(g, sel, shareUrl, planned);
  const L: string[] = [
    `# ${g.name} OAuth setup kit`,
    ``,
    `${g.summary}`,
    ``,
    `- Needs: ${g.capabilities.filter((c) => sel.includes(c.id)).map((c) => c.label).join(", ")}`,
    `- Difficulty: ${h.difficulty.label} · Wait for approval: ${h.wait} · Hands-on: ${h.effort}`,
    `- Composio-managed OAuth: ${g.composio.managed.replace("_", " ")}`,
    `- ${g.origin === "curated" ? `Hand-researched, verified ${g.verifiedAt}` : `Agent-generated ${g.verifiedAt}, not human-reviewed`}`,
    ...(shareUrl ? [`- Live guide: ${shareUrl}`] : []),
    ``,
    `## Checklist`,
    ...steps.map((s, i) => `${i + 1}. [ ] ${s.title} (${s.owner === "agent" ? "agent" : s.owner === "you" ? "you" : "agent + you"}, ~${fmtEffort(s.activeMinutes)}${s.waitDays[1] ? `, wait ${s.waitDays[0]}–${s.waitDays[1]}d` : ""}) [${s.evidence}]`),
    ``,
  ];
  for (const k of kit) {
    L.push(`## ${k.title}`, ``, `_${k.hint}_`, ``);
    if (k.lang === "md") L.push(k.body); else L.push("```" + (k.lang === "json" ? "json" : ""), k.body, "```");
    L.push("");
  }
  L.push(`## Sources`, ...g.sources.map((s, i) => `${i + 1}. [${s.title}](${s.url})`));
  return L.join("\n");
}
