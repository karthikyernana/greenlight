import type { Guide } from "./types";
import { activeSteps, headline, startTheClock, TIER_META, fmtEffort } from "./plan";

const ownerLabel = { agent: "Agent can do this", you: "You", both: "Agent + you" } as const;

export function toMarkdown(g: Guide, sel: string[], url?: string): string {
  const h = headline(g, sel);
  const caps = g.capabilities.filter((c) => sel.includes(c.id));
  const steps = activeSteps(g, sel);
  const clock = startTheClock(steps);
  const L: string[] = [];
  L.push(`# ${g.name}: OAuth app setup & approval guide`);
  L.push("");
  L.push(`> ${g.summary}`);
  L.push("");
  L.push(`**For:** ${caps.map((c) => c.label).join(", ")}  `);
  L.push(`**Difficulty:** ${h.difficulty.label} (${TIER_META[h.tier].label}) · **Time to full approval:** ${h.wait} · **Hands-on effort:** ${h.effort}  `);
  L.push(`**Composio-managed OAuth:** ${g.composio.managed === "available" ? "available" : g.composio.managed === "not_available" ? "not available (bring your own app)" : "unknown"}  `);
  if (g.console) L.push(`**Register at:** ${g.console}  `);
  L.push(`**Last verified:** ${g.verifiedAt} (${g.origin === "curated" ? "hand-researched" : "agent-generated, not yet reviewed by a human"})`);
  if (url) L.push(`**Live guide:** ${url}`);
  L.push("");
  if (g.launchToday.length) {
    L.push(`## Launch today`);
    g.launchToday.forEach((x) => L.push(`- ${x}`));
    L.push("");
  }
  if (clock.length) {
    L.push(`## Start the clock today (long waits, run in parallel)`);
    clock.forEach((s) => L.push(`- **${s.title}**: provider wait ${s.waitDays[0]}–${s.waitDays[1]} days`));
    L.push("");
  }
  L.push(`## Scopes`);
  caps.forEach((c) => L.push(`- **${c.label}** [${TIER_META[c.tier].label}] ${c.scopes.length ? "`" + c.scopes.join("`, `") + "`" : ""}: ${c.why}`));
  L.push("");
  L.push(`## Steps`);
  steps.forEach((s, i) => {
    L.push(`${i + 1}. [ ] **${s.title}** (${ownerLabel[s.owner]}, ~${fmtEffort(s.activeMinutes)}${s.waitDays[1] ? `, wait ${s.waitDays[0]}–${s.waitDays[1]}d` : ""}${s.cost ? `, cost: ${s.cost}` : ""}) [${s.evidence}]`);
    L.push(`   ${s.detail.replace(/\*\*/g, "")}`);
    if (s.agent) L.push(`   - Agent: ${s.agent}`);
    if (s.human) L.push(`   - You: ${s.human}`);
    if (s.link) L.push(`   - ${s.link}`);
  });
  L.push("");
  if (g.rejections.length) {
    L.push(`## Common rejection reasons`);
    g.rejections.forEach((x) => L.push(`- ${x}`));
    L.push("");
  }
  if (g.blockers.length) {
    L.push(`## If you're blocked`);
    g.blockers.forEach((b) => L.push(`- **${b.problem}**: ${b.fix}`));
    L.push("");
  }
  if (g.probes.length) {
    L.push(`## Tested (live public probes)`);
    g.probes.forEach((p) => L.push(`- ${p.label} (${p.at}): ${p.result} (${p.url})`));
    L.push("");
  }
  if (g.uncertain.length) {
    L.push(`## Uncertain`);
    g.uncertain.forEach((x) => L.push(`- ${x}`));
    L.push("");
  }
  L.push(`## Sources`);
  g.sources.forEach((s, i) => L.push(`${i + 1}. [${s.title}](${s.url})`));
  return L.join("\n");
}

/** A prompt a developer can paste into Claude Code / Cursor / a browser agent to do the agent-owned parts. */
export function toAgentPrompt(g: Guide, sel: string[]): string {
  const steps = activeSteps(g, sel);
  const caps = g.capabilities.filter((c) => sel.includes(c.id));
  const payload = {
    provider: g.name,
    console: g.console,
    capabilities: caps.map((c) => ({ label: c.label, scopes: c.scopes, tier: c.tier })),
    redirect_uris: ["<your app>/api/auth/callback", "https://backend.composio.dev/api/v3/toolkits/auth/callback (if using Composio bring-your-own-app)"],
    your_tasks: steps.filter((s) => s.owner !== "you").map((s) => ({ id: s.id, title: s.title, do: s.agent || s.detail, link: s.link })),
    hand_back_to_human: steps.filter((s) => s.owner !== "agent").map((s) => ({ id: s.id, title: s.title, human: s.human || s.detail })),
    sources: g.sources.map((s) => s.url),
  };
  return `You are helping me register an OAuth app with ${g.name} and get it approved so my AI agent's users can connect their ${g.name} accounts.
Do every task in "your_tasks" that you can do from code or docs (configs, manifests, privacy policy drafts, reviewer notes, redirect URIs, test scripts).
When you reach anything in "hand_back_to_human" (signing in, legal/business documents, payments, identity, recording video, clicking Submit), STOP, tell me exactly what to do, and wait.
Never submit anything for review or pay on my behalf. Cite the source URL for every requirement you rely on.

${JSON.stringify(payload, null, 2)}`;
}

export function toEmailDraft(g: Guide): string {
  const q = g.uncertain.slice(0, 3);
  return `Subject: Questions about OAuth app review for an AI agent integration

Hi ${g.name} developer support team,

We're building an AI agent that lets our users connect their ${g.name} accounts via OAuth (${g.capabilities.filter((c) => c.default).map((c) => c.label.toLowerCase()).join(", ")}). Before we submit, could you help clarify:

${(q.length ? q.map((x) => `Our understanding is: “${x.replace(/\.$/, "")}”. Can you confirm or correct this?`) : ["What is the typical review timeline today for a new app requesting these permissions?"]).map((x, i) => `${i + 1}. ${x}`).join("\n")}
${q.length + 1}. Is there anything we can prepare in advance (documents, demo video, test account) to avoid a second review round?

Thanks,
<name>, <company>`;
}
