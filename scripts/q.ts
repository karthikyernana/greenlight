import { fetchCached } from "./fetch-sources";
const [url, re] = process.argv.slice(2);
fetchCached(url).then((r) => {
  const t = r.text; const rx = new RegExp(re, "gi"); let m; let n = 0;
  console.log("status", r.status, "len", t.length);
  while ((m = rx.exec(t)) && n++ < 8) console.log("…" + t.slice(Math.max(0, m.index - 220), m.index + 260).replace(/\s+/g, " ") + "…\n");
});
