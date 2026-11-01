import { test } from "node:test";
import assert from "node:assert/strict";
import { getGuide } from "../lib/library";
import { guideHref, cleanSelection, parseNeed, decodeGuideHash, slugify } from "../lib/urlstate";

const gmail = getGuide("gmail")!;
const calendly = getGuide("calendly")!;

test("default selection gives a clean canonical link", () => {
  assert.equal(guideHref(gmail), "/guide/gmail");
  assert.equal(guideHref(gmail, ["read", "signin"]), "/guide/gmail");
});

test("non-default selection is encoded in ?need=", () => {
  assert.equal(guideHref(gmail, ["signin", "send"]), "/guide/gmail?need=signin,send");
  assert.equal(guideHref(gmail, ["signin", "send"], { origin: "https://x.dev" }), "https://x.dev/guide/gmail?need=signin,send");
});

test("parse + clean round-trip drops junk and duplicates", () => {
  assert.deepEqual(parseNeed("signin,send"), ["signin", "send"]);
  assert.equal(parseNeed(""), undefined);
  assert.deepEqual(cleanSelection(gmail, ["send", "bogus", "send"]), ["send"]);
  assert.deepEqual(cleanSelection(gmail, ["bogus"]), cleanSelection(gmail, undefined));
});

test("generated guides travel inside the link (#g=) and decode intact", () => {
  const href = guideHref(calendly, ["read", "book"], { embed: true });
  assert.match(href, /^\/guide\/calendly\?need=read,book#g=/);
  const back = decodeGuideHash(href.slice(href.indexOf("#")));
  assert.ok(back);
  assert.equal(back!.slug, "calendly");
  assert.equal(back!.steps.length, calendly.steps.length);
  // curated guides never embed
  assert.ok(!guideHref(gmail, undefined, { embed: true }).includes("#g="));
  assert.equal(decodeGuideHash("#g=not-valid"), null);
});

test("slugify handles names and URLs", () => {
  assert.equal(slugify("https://www.calendly.com/"), "calendly");
  assert.equal(slugify("Google Calendar"), "google-calendar");
  assert.equal(slugify("pipedrive.com/developers"), "pipedrive");
});
