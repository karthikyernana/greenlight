import { getTrace } from "@/lib/pipeline/trace";
import { getStoredTrace } from "@/lib/store";
export const dynamic = "force-dynamic";
export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const t = getTrace(id) || (await getStoredTrace(id));
  return t ? Response.json(t) : Response.json({ error: "not found" }, { status: 404 });
}
