import { providerStatus } from "@/lib/llm";
import { jevStatus } from "@/lib/jev";
import { retrievalStatus } from "@/lib/retrieval";
import { storeStatus, storeHealth, listStored, STALE_DAYS, RECHECK_COOLDOWN_MIN } from "@/lib/store";
export const dynamic = "force-dynamic";
/** Which engines are configured. Booleans, hosts and model names only; never a key. */
export async function GET() {
  const [stored, health] = await Promise.all([listStored(), storeHealth()]);
  return Response.json({
    ...providerStatus(), jev: jevStatus(), retrievalLayer: retrievalStatus(),
    store: { ...storeStatus(), ...health, guides: stored.length, verified: stored.filter((s) => s.status === "verified").length, staleAfterDays: STALE_DAYS, recheckCooldownMin: RECHECK_COOLDOWN_MIN },
  });
}
