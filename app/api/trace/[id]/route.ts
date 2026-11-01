import { getTrace } from "@/lib/pipeline/trace";
export const dynamic = "force-dynamic";
export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const t = getTrace(id);
  return t ? Response.json(t) : Response.json({ error: "not found" }, { status: 404 });
}
