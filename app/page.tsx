import { jevConfigured } from "@/lib/jev";
import { boardIndex, intentIndex } from "@/lib/library";
import Board from "@/components/Board";

/* Re-read the shared store at most once a minute so newly Verified guides join the board. */
export const revalidate = 60;

export default async function Home() {
  const { index, drafts } = await boardIndex();
  return <Board index={index} drafts={drafts} intents={intentIndex()} jev={jevConfigured()} />;
}
