import { providerStatus } from "@/lib/llm";
export const dynamic = "force-dynamic";
export async function GET() {
  return Response.json(await providerStatus());
}
