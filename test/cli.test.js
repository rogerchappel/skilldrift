import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { test } from "node:test";
import { help, run, version } from "../src/index.js";

const execFileAsync = promisify(execFile);

test("skilldrift --help describes the current scaffold", async () => {
  const { stdout, stderr } = await execFileAsync("node", ["src/index.js", "--help"]);

  assert.equal(stderr, "");
  assert.match(stdout, /skilldrift/);
  assert.match(stdout, /Usage:/);
  assert.match(stdout, /check <skills-dir>/);
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

test("skilldrift check passes for a skill with valid relative links", async () => {
  const fixture = await mkdtemp(path.join(tmpdir(), "skilldrift-valid-"));
  const skillDir = path.join(fixture, "review-skill");
  await mkdir(path.join(skillDir, "scripts"), { recursive: true });
  await writeFile(
    path.join(skillDir, "SKILL.md"),
    "# Review Skill\n\nUse [the checker](scripts/check.sh) before publishing.\n",
  );
  await writeFile(path.join(skillDir, "scripts", "check.sh"), "echo ok\n");

  const { stdout, stderr } = await execFileAsync("node", ["src/index.js", "check", fixture]);

  assert.equal(stderr, "");
  assert.match(stdout, /checked 1 skill file/);
  assert.match(stdout, /No drift found/);
});

test("skilldrift check fails when SKILL.md references a missing file", async () => {
  const fixture = await mkdtemp(path.join(tmpdir(), "skilldrift-missing-"));
  const skillDir = path.join(fixture, "deploy-skill");
  await mkdir(skillDir, { recursive: true });
  await writeFile(
    path.join(skillDir, "SKILL.md"),
    "# Deploy Skill\n\nRun [deploy](scripts/deploy.sh) after review.\n",
  );

  await assert.rejects(
    execFileAsync("node", ["src/index.js", "check", fixture]),
    (error) => {
      assert.match(error.stdout, /missing-reference/);
      assert.match(error.stdout, /scripts\/deploy\.sh/);
      return true;
    },
  );
});

test("skilldrift check --json emits machine-readable issue details", async () => {
  const fixture = await mkdtemp(path.join(tmpdir(), "skilldrift-json-"));
  await mkdir(path.join(fixture, "empty-skill"), { recursive: true });
  await writeFile(path.join(fixture, "empty-skill", "SKILL.md"), "No title yet.\n");

  await assert.rejects(
    execFileAsync("node", ["src/index.js", "check", fixture, "--json"]),
    (error) => {
      const report = JSON.parse(error.stdout);
      assert.equal(report.ok, false);
      assert.equal(report.issues[0].code, "missing-title");
      return true;
    },
  );
});
