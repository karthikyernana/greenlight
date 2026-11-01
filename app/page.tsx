import { libraryIndex } from "@/lib/library";
import Board from "@/components/Board";

export default function Home() {
  return <Board index={libraryIndex()} />;
}
