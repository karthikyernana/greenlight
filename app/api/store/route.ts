import { listStored } from "@/lib/store";
export const dynamic = "force-dynamic";
/** Summaries of every stored guide (drafts included) so the command bar can match before generating. */
export async function GET() {
  return Response.json({ guides: await listStored() }, { headers: { "cache-control": "public, max-age=30, s-maxage=60" } });
}
