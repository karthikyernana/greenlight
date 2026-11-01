/* Fetch every cited source once and cache its text (scripts/.cache, gitignored). Used by build-graph to pull verbatim quotes. */
import { createHash } from "node:crypto";
import { mkdirSync, writeFileSync, existsSync, readFileSync } from "node:fs";
import { fetchText, htmlToText } from "../lib/probe";
export const CACHE = process.cwd() + "/scripts/.cache/";
export const key = (u: string) => createHash("sha1").update(u).digest("hex").slice(0, 16);
export function cached(u: string): { status: number; text: string } | null {
  const p = CACHE + key(u) + ".json";
  return existsSync(p) ? JSON.parse(readFileSync(p, "utf8")) : null;
}
export async function fetchCached(u: string, force = false) {
  mkdirSync(CACHE, { recursive: true });
  const c = cached(u);
  if (c && !force && c.status === 200) return c;
  const r = await fetchText(u, 15000, { headers: { "user-agent": "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36" } });
  const out = { url: u, status: r?.status || 0, text: r ? htmlToText(r.text) : "" };
  writeFileSync(CACHE + key(u) + ".json", JSON.stringify(out));
  return out;
}
if (process.argv[1]?.endsWith("fetch-sources.ts")) {
  const urls = [...new Set(readFileSync(0, "utf8").split("\n").map((l) => l.split("\t")[1]).filter(Boolean))];
  Promise.all(urls.map(async (u) => { const r = await fetchCached(u); return `${r.status}\t${r.text.length}\t${u}`; })).then((res) => console.log(res.join("\n")));
}
