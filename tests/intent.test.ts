/* Need intake: an app name or a sentence → app, capabilities, audience/scale/business hints. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { parseIntent } from "../lib/intent";
import { intentIndex } from "../lib/library";

const idx = intentIndex();

test("a sentence finds the app and the capabilities it mentions", () => {
  const i = parseIntent("agent that triages my users' Gmail and drafts replies", idx);
  assert.equal(i.slug, "gmail");
  assert.equal(i.ready, true);
  assert.ok(i.caps.length >= 1);
  assert.equal(i.sentence, true);
});

test("audience, scale and business hints are read from plain words", () => {
  const i = parseIntent("posts to Slack for just my team, no registered company", idx);
  assert.equal(i.slug, "slack");
  assert.equal(i.profile.audience, "team");
  assert.equal(i.profile.business, false);
});

test("an app the library doesn't have is still named, marked not ready", () => {
  const i = parseIntent("syncs invoices from Zzqxbooks for my customers", idx);
  assert.equal(i.ready, false);
});
