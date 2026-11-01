import { providerStatus } from "@/lib/llm";
import { jevStatus } from "@/lib/jev";
import { retrievalStatus } from "@/lib/retrieval";
export const dynamic = "force-dynamic";
/** Which engines are configured. Booleans, hosts and model names only; never a key. */
export async function GET() {
  return Response.json({ ...providerStatus(), jev: jevStatus(), retrievalLayer: retrievalStatus() });
}
