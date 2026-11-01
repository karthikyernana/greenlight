import { test } from "node:test";
import assert from "node:assert/strict";
import { checkQuote, extractQuote } from "../lib/quote";
import { extractJson } from "../lib/llm";

const SRC = "Brand Verification … 2-3 Business days. Sensitive Scope Verification Ensure that an app’s usage of sensitive scopes is not deceptive and in alignment with the appropriate use case, limited use, and minimum scope requirements. 10 Business days";

test("quote check: exact, punctuation-insensitive, and stitched quotes pass", () => {
  assert.equal(checkQuote("2-3 Business days", SRC).found, true);
  assert.equal(checkQuote("Ensure that an app's usage of sensitive scopes is not deceptive", SRC).how, "exact");
  assert.equal(checkQuote("Sensitive Scope Verification: Ensure that an app’s usage of sensitive scopes is not deceptive, and in alignment with the appropriate use case", SRC).found, true);
});

test("quote check: fabricated or altered quotes fail", () => {
  assert.equal(checkQuote("Every scope is approved instantly and no review is ever required.", SRC).found, false);
  assert.equal(checkQuote("Sensitive Scope Verification takes 2 business days and is optional for all apps", SRC).found, false);
  assert.equal(checkQuote("days", SRC).found, false); // too short to count
});

test("extractQuote returns verbatim text around the phrase", () => {
  const q = extractQuote(SRC, "10 Business days");
  assert.ok(SRC.replace(/\s+/g, " ").includes(q));
});

test("extractJson survives think blocks, fences and DeepSeek-style trailing junk", () => {
  assert.deepEqual(extractJson('<think>plan the answer {"x":1}</think>\n```json\n{"ok":true}\n```'), { ok: true });
  assert.deepEqual(extractJson('{"ok":true}# \n{"ok":true}{"ok":true} response{"ok"'), { ok: true });
  assert.deepEqual(extractJson('Sure! {"a":{"b":"}"}} trailing'), { a: { b: "}" } });
  assert.throws(() => extractJson('{"a": 1, "b": '));
});
