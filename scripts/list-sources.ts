import { seeds } from "../data/seeds";
import gen from "../data/generated/index.json";
for (const g of [...seeds, ...(gen as any[])]) for (const s of g.sources) console.log(g.slug + "\t" + s.url);
