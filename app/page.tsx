import { jevConfigured } from "@/lib/jev";
import { libraryIndex, intentIndex } from "@/lib/library";
import Board from "@/components/Board";

export default function Home() {
  return <Board index={libraryIndex()} intents={intentIndex()} jev={jevConfigured()} />;
}
