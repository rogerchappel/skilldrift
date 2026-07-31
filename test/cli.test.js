import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { test } from "node:test";
import { checkSkills, help, run, version } from "../src/index.js";

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

test("skilldrift check accepts a body heading after YAML frontmatter", async () => {
  const fixture = await mkdtemp(path.join(tmpdir(), "skilldrift-frontmatter-"));
  const skillDir = path.join(fixture, "review-skill");
  await mkdir(path.join(skillDir, "references"), { recursive: true });
  await writeFile(
    path.join(skillDir, "SKILL.md"),
    [
      "---",
      "name: review-skill",
      "description: Review changes carefully",
      "---",
      "# Review Skill",
      "",
      "Read [the guide](references/guide.md).",
      "",
    ].join("\n"),
  );
  await writeFile(path.join(skillDir, "references", "guide.md"), "# Guide\n");

  const result = checkSkills(fixture);
  assert.equal(result.ok, true);
  assert.deepEqual(result.issues, []);

  const { stdout, stderr } = await execFileAsync("node", ["src/index.js", "check", fixture]);
  assert.equal(stderr, "");
  assert.match(stdout, /No drift found/);
});

test("skilldrift check rejects a titleless body after YAML frontmatter", async () => {
  const fixture = await mkdtemp(path.join(tmpdir(), "skilldrift-frontmatter-titleless-"));
  const skillDir = path.join(fixture, "review-skill");
  await mkdir(skillDir, { recursive: true });
  await writeFile(
    path.join(skillDir, "SKILL.md"),
    "---\nname: review-skill\n---\nReview changes carefully.\n",
  );

  const result = checkSkills(fixture);
  assert.equal(result.ok, false);
  assert.equal(result.issues[0].code, "missing-title");

  await assert.rejects(
    execFileAsync("node", ["src/index.js", "check", fixture, "--json"]),
    (error) => {
      assert.equal(error.stderr, "");
      const report = JSON.parse(error.stdout);
      assert.equal(report.issues[0].code, "missing-title");
      return true;
    },
  );
});

test("skilldrift check treats unclosed YAML frontmatter as titleless", async () => {
  const fixture = await mkdtemp(path.join(tmpdir(), "skilldrift-frontmatter-unclosed-"));
  const skillDir = path.join(fixture, "review-skill");
  await mkdir(skillDir, { recursive: true });
  await writeFile(
    path.join(skillDir, "SKILL.md"),
    "---\nname: review-skill\n# Text inside the unclosed block\n",
  );

  const result = checkSkills(fixture);
  assert.equal(result.ok, false);
  assert.equal(result.issues[0].code, "missing-title");

  await assert.rejects(
    execFileAsync("node", ["src/index.js", "check", fixture]),
    (error) => {
      assert.equal(error.stderr, "");
      assert.match(error.stdout, /missing-title/);
      return true;
    },
  );
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

test("skilldrift check accepts an existing angle-bracket link containing spaces", async () => {
  const fixture = await mkdtemp(path.join(tmpdir(), "skilldrift-angle-valid-"));
  const skillDir = path.join(fixture, "review-skill");
  await mkdir(path.join(skillDir, "docs"), { recursive: true });
  await writeFile(
    path.join(skillDir, "SKILL.md"),
    "# Review Skill\n\nRead [the guide](<docs/review guide.md>) first.\n",
  );
  await writeFile(path.join(skillDir, "docs", "review guide.md"), "# Guide\n");

  const { stdout, stderr } = await execFileAsync("node", ["src/index.js", "check", fixture]);

  assert.equal(stderr, "");
  assert.match(stdout, /No drift found/);
});

test("skilldrift check normalizes query and fragment suffixes on local links", async () => {
  const fixture = await mkdtemp(path.join(tmpdir(), "skilldrift-suffixes-"));
  const skillDir = path.join(fixture, "review-skill");
  await mkdir(path.join(skillDir, "docs"), { recursive: true });
  await writeFile(
    path.join(skillDir, "SKILL.md"),
    [
      "# Review Skill",
      "",
      "Read the [query copy](docs/guide.md?raw=1),",
      "the [fragment](docs/guide.md#intro),",
      "the [combined copy](docs/guide.md?raw=1#intro),",
      "and the [encoded guide](<docs/review%20guide.md?download=1#intro>),",
      "even with a [malformed suffix](docs/guide.md?version=100%#intro).",
      "",
    ].join("\n"),
  );
  await writeFile(path.join(skillDir, "docs", "guide.md"), "# Guide\n");
  await writeFile(path.join(skillDir, "docs", "review guide.md"), "# Review Guide\n");

  const result = checkSkills(fixture);

  assert.equal(result.ok, true);
  assert.deepEqual(result.issues, []);
});

test("skilldrift check preserves the original suffixed target in diagnostics", async () => {
  const fixture = await mkdtemp(path.join(tmpdir(), "skilldrift-suffix-diagnostic-"));
  const skillDir = path.join(fixture, "review-skill");
  await mkdir(skillDir, { recursive: true });
  const target = "docs/missing%20guide.md?raw=1#intro";
  await writeFile(
    path.join(skillDir, "SKILL.md"),
    `# Review Skill\n\nRead [the guide](${target}) first.\n`,
  );

  const result = checkSkills(fixture);

  assert.equal(result.ok, false);
  assert.equal(result.issues[0].target, target);
  assert.equal(result.issues[0].message, `Referenced file does not exist: ${target}`);
});

test("skilldrift check reports a missing angle-bracket link containing spaces", async () => {
  const fixture = await mkdtemp(path.join(tmpdir(), "skilldrift-angle-missing-"));
  const skillDir = path.join(fixture, "review-skill");
  await mkdir(skillDir, { recursive: true });
  await writeFile(
    path.join(skillDir, "SKILL.md"),
    "# Review Skill\n\nRead [the guide](<docs/missing guide.md>) first.\n",
  );

  await assert.rejects(
    execFileAsync("node", ["src/index.js", "check", fixture]),
    (error) => {
      assert.equal(error.stderr, "");
      assert.match(error.stdout, /missing-reference/);
      assert.match(error.stdout, /docs\/missing guide\.md/);
      return true;
    },
  );

  await assert.rejects(
    execFileAsync("node", ["src/index.js", "check", fixture, "--json"]),
    (error) => {
      assert.equal(error.stderr, "");
      const report = JSON.parse(error.stdout);
      assert.equal(report.ok, false);
      assert.equal(report.issues[0].code, "missing-reference");
      assert.equal(report.issues[0].target, "docs/missing guide.md");
      return true;
    },
  );
});

test("skilldrift check reports malformed percent escapes without crashing", async () => {
  const fixture = await mkdtemp(path.join(tmpdir(), "skilldrift-percent-"));
  const skillDir = path.join(fixture, "review-skill");
  await mkdir(skillDir, { recursive: true });
  await writeFile(
    path.join(skillDir, "SKILL.md"),
    "# Review Skill\n\nRead [the draft](docs/100%-ready.md) first.\n",
  );

  await assert.rejects(
    execFileAsync("node", ["src/index.js", "check", fixture]),
    (error) => {
      assert.equal(error.stderr, "");
      assert.match(error.stdout, /missing-reference/);
      assert.match(error.stdout, /docs\/100%-ready\.md/);
      return true;
    },
  );

  await assert.rejects(
    execFileAsync("node", ["src/index.js", "check", fixture, "--json"]),
    (error) => {
      assert.equal(error.stderr, "");
      const report = JSON.parse(error.stdout);
      assert.equal(report.ok, false);
      assert.equal(report.issues[0].code, "missing-reference");
      assert.equal(report.issues[0].target, "docs/100%-ready.md");
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
