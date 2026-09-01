import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("package smoke installs and imports the generated tarball", async () => {
  const script = await readFile(new URL("../scripts/package-smoke.mjs", import.meta.url), "utf8");

  assert.match(script, /\["pack", "--json"\]/);
  assert.match(script, /\["install", "--ignore-scripts", tarball\]/);
  assert.match(script, /import\(\"skilldrift\"\)/);
  assert.match(script, /"node_modules",\s+"\.bin"/);
  assert.match(script, /"skilldrift\.cmd" : "skilldrift"/);
  assert.doesNotMatch(script, /"--dry-run"/);
});
