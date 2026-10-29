process.env.GEMINI_API_KEY = "mock";
const realFetch = globalThis.fetch;
let calls: string[] = [];
globalThis.fetch = (async (input: any, init?: any) => {
  const url = String(input?.url || input);
  if (url.includes("generativelanguage.googleapis.com")) {
    calls.push(url);
    if (url.includes("gemini-flash-latest") && calls.length === 1) return new Response("not found", { status: 404 });
    const body = JSON.parse(init.body);
    if (body.tools) {
      return Response.json({ candidates: [{ content: { parts: [{ text: "OFFICIAL_DOMAIN: calendly.com\nCalendly OAuth apps are created at https://developer.calendly.com ... No review for standard scopes. https://developer.calendly.com/getting-started" }] },
        groundingMetadata: { groundingChunks: [{ web: { uri: "https://developer.calendly.com/getting-started", title: "calendly.com" } }, { web: { uri: "https://vertexaisearch.cloud.google.com/grounding-api-redirect/abc", title: "calendly.com" } }] } }] });
    }
    const guide = { name: "Calendly", domain: "calendly.com", category: "Scheduling", summary: "Self-serve OAuth.", console: "https://developer.calendly.com",
      appType: "OAuth app", capabilities: [{ id: "read", label: "Read events", scopes: ["default"], tier: "self_serve", why: "no review", default: true, evidence: "tested", sources: [0, 9] }, { id: "x", label: "Weird", tier: "bogus" }],
      steps: [{ id: "a", title: "Create app", detail: "d", owner: "agent", activeMinutes: 10, waitDays: [0, 0], requiredFor: [], evidence: "sourced", sources: [0] }, { id: "b", title: "Wait", detail: "d", owner: "robot", waitDays: [3], after: ["a"], requiredFor: ["nope"] }],
      launchToday: ["Use Composio"], rejections: ["x"], blockers: [{ problem: "p", fix: "f" }], uncertain: ["u"] };
    return Response.json({ candidates: [{ content: { parts: [{ text: "```json\n" + JSON.stringify(guide) + "\n```" }] } }] });
  }
  return realFetch(input, init);
}) as any;
(async () => {
  const { generateGuide } = await import("../lib/agent");
  for await (const ev of generateGuide("Calendly")) {
    if (ev.type === "guide") console.log("GUIDE", JSON.stringify(ev.guide).slice(0, 900));
    else console.log(JSON.stringify(ev).slice(0, 300));
  }
  console.log("gemini calls", calls.map((c) => c.split("/models/")[1]));
})();
