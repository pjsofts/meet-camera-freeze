// Checks the extension manifest. Run: node --test tests/manifest.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const manifest = JSON.parse(readFileSync(join(root, "manifest.json"), "utf8"));

test("uses Manifest V3", () => {
  assert.equal(manifest.manifest_version, 3);
});

test("every file the manifest references exists", () => {
  const files = [
    manifest.background.service_worker,
    manifest.action.default_popup,
    ...manifest.content_scripts.flatMap((s) => s.js),
  ];
  for (const f of files) assert.ok(existsSync(join(root, f)), `missing ${f}`);
});

test("only runs on Google Meet", () => {
  assert.deepEqual(manifest.host_permissions, ["https://meet.google.com/*"]);
  for (const s of manifest.content_scripts) assert.deepEqual(s.matches, ["https://meet.google.com/*"]);
});

test("Alt+Shift+F toggles the freeze", () => {
  assert.equal(manifest.commands["toggle-freeze"].suggested_key.default, "Alt+Shift+F");
});

test("the camera hook runs in the page, the bridge stays isolated", () => {
  const byFile = Object.fromEntries(manifest.content_scripts.map((s) => [s.js[0], s]));
  assert.equal(byFile["inject.js"].world, "MAIN");
  assert.equal(byFile["bridge.js"].world, "ISOLATED");
  assert.equal(byFile["inject.js"].run_at, "document_start");
});
