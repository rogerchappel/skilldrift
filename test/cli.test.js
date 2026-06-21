import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { readFile } from "node:fs/promises";
import { promisify } from "node:util";
import { test } from "node:test";
import { help, run, version } from "../src/index.js";

const execFileAsync = promisify(execFile);
const expectedHelp = `${(await readFile("test/fixtures/help.txt", "utf8")).trimEnd()}\n`;

test("skilldrift --help describes the current scaffold", async () => {
  const { stdout, stderr } = await execFileAsync("node", ["src/index.js", "--help"]);

  assert.equal(stderr, "");
  assert.equal(stdout, expectedHelp);
});

test("skilldrift --version prints the package version", async () => {
  const { stdout, stderr } = await execFileAsync("node", ["src/index.js", "--version"]);

  assert.equal(stderr, "");
  assert.equal(stdout, `${version}\n`);
});

test("run emits help and version through an injectable logger", () => {
  const lines = [];
  const log = (line) => lines.push(line);

  run([], log);
  run(["--version"], log);
  run(["-v"], log);

  assert.deepEqual(lines, [help, version, version]);
});
