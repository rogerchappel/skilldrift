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

async function assertUsageError(args, diagnostic) {
  await assert.rejects(
    execFileAsync("node", ["src/index.js", ...args]),
    (error) => {
      assert.equal(error.code, 2);
      assert.equal(error.stdout, "");
      assert.match(error.stderr, diagnostic);
      assert.match(error.stderr, /Usage:/);
      return true;
    },
  );
}

test("skilldrift rejects an unknown command", async () => {
  await assertUsageError(["bogus"], /unknown command 'bogus'/);
});

test("skilldrift check rejects an unknown option", async () => {
  await assertUsageError(["check", ".", "--bogus"], /unknown option '--bogus'/);
});

test("skilldrift rejects missing and extra check operands", async () => {
  await assertUsageError(["check"], /missing <skills-dir>/);
  await assertUsageError(["check", ".", "extra"], /unexpected argument 'extra'/);
});

test("skilldrift accepts all documented invocation forms", async () => {
  const fixture = await mkdtemp(path.join(tmpdir(), "skilldrift-invocations-"));
  const skillDir = path.join(fixture, "valid-skill");
  await mkdir(skillDir, { recursive: true });
  await writeFile(path.join(skillDir, "SKILL.md"), "# Valid Skill\n");

  for (const args of [["--help"], ["--version"], ["check", fixture]]) {
    const { stderr } = await execFileAsync("node", ["src/index.js", ...args]);
    assert.equal(stderr, "");
  }

  const { stdout, stderr } = await execFileAsync(
    "node",
    ["src/index.js", "check", fixture, "--json"],
  );
  assert.equal(stderr, "");
  assert.equal(JSON.parse(stdout).ok, true);
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

test("skilldrift check ignores links inside backtick and tilde fences", async () => {
  const fixture = await mkdtemp(path.join(tmpdir(), "skilldrift-fences-"));
  const skillDir = path.join(fixture, "review-skill");
  await mkdir(skillDir, { recursive: true });
  await writeFile(
    path.join(skillDir, "SKILL.md"),
    [
      "# Review Skill",
      "",
      "````markdown",
      "[ignored backtick link](examples/backtick.md)",
      "```",
      "[still ignored](examples/short-close.md)",
      "````",
      "",
      "~~~~ docs",
      "[ignored tilde link](examples/tilde.md)",
      "~~~~~",
      "",
    ].join("\n"),
  );

  const result = checkSkills(fixture);
  assert.equal(result.ok, true);
  assert.deepEqual(result.issues, []);

  const { stdout, stderr } = await execFileAsync("node", ["src/index.js", "check", fixture]);
  assert.equal(stderr, "");
  assert.match(stdout, /No drift found/);
});

test("skilldrift check ignores links after an unclosed fence", async () => {
  const fixture = await mkdtemp(path.join(tmpdir(), "skilldrift-unclosed-fence-"));
  const skillDir = path.join(fixture, "review-skill");
  await mkdir(skillDir, { recursive: true });
  await writeFile(
    path.join(skillDir, "SKILL.md"),
    "# Review Skill\n\n```md\n[example](examples/missing.md)\n",
  );

  const result = checkSkills(fixture);
  assert.equal(result.ok, true);
  assert.deepEqual(result.issues, []);
});

test("skilldrift check reports a genuine link after a closed fence in JSON", async () => {
  const fixture = await mkdtemp(path.join(tmpdir(), "skilldrift-after-fence-"));
  const skillDir = path.join(fixture, "review-skill");
  await mkdir(skillDir, { recursive: true });
  await writeFile(
    path.join(skillDir, "SKILL.md"),
    [
      "# Review Skill",
      "",
      "~~~md",
      "[example](examples/ignored.md)",
      "~~~   ",
      "",
      "Read [the real guide](docs/missing.md).",
      "",
    ].join("\n"),
  );

  await assert.rejects(
    execFileAsync("node", ["src/index.js", "check", fixture, "--json"]),
    (error) => {
      assert.equal(error.stderr, "");
      const report = JSON.parse(error.stdout);
      assert.equal(report.issues.length, 1);
      assert.equal(report.issues[0].code, "missing-reference");
      assert.equal(report.issues[0].target, "docs/missing.md");
      return true;
    },
  );
});

test("skilldrift check ignores inline code spans without hiding adjacent links", async () => {
  const fixture = await mkdtemp(path.join(tmpdir(), "skilldrift-code-spans-"));
  const skillDir = path.join(fixture, "review-skill");
  await mkdir(skillDir, { recursive: true });
  await writeFile(
    path.join(skillDir, "SKILL.md"),
    [
      "# Review Skill",
      "",
      "Read [before](docs/before.md), then `[ignored](examples/one.md)`.",
      "Double markers also ignore ``[escaped ` marker](examples/two.md)``.",
      "An escaped opening \\` leaves [after escaped](docs/escaped.md) visible.",
      "An unmatched ` leaves [after unmatched](docs/unmatched.md) visible.",
      "Finally, read [after](docs/after.md).",
      "",
    ].join("\n"),
  );

  const result = checkSkills(fixture);

  assert.equal(result.ok, false);
  assert.deepEqual(
    result.issues.map((issue) => issue.target),
    ["docs/before.md", "docs/escaped.md", "docs/unmatched.md", "docs/after.md"],
  );
});

test("skilldrift check ignores CommonMark indented code blocks", async () => {
  const fixture = await mkdtemp(path.join(tmpdir(), "skilldrift-indented-code-"));
  const skillDir = path.join(fixture, "review-skill");
  await mkdir(skillDir, { recursive: true });
  await writeFile(
    path.join(skillDir, "SKILL.md"),
    [
      "# Review Skill",
      "",
      "Read [before](docs/before.md).",
      "",
      "    [ignored with spaces](examples/spaces.md)",
      "\t[ignored with tab](examples/tab.md)",
      "",
      "Read [after](docs/after.md).",
      "",
    ].join("\n"),
  );

  const result = checkSkills(fixture);

  assert.equal(result.ok, false);
  assert.deepEqual(
    result.issues.map((issue) => issue.target),
    ["docs/before.md", "docs/after.md"],
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

test("skilldrift check accepts existing destinations containing parentheses", async () => {
  const fixture = await mkdtemp(path.join(tmpdir(), "skilldrift-parentheses-valid-"));
  const skillDir = path.join(fixture, "review-skill");
  await mkdir(path.join(skillDir, "docs"), { recursive: true });
  await writeFile(
    path.join(skillDir, "SKILL.md"),
    [
      "# Review Skill",
      "",
      "Read the [balanced guide](docs/guide_(v2).md),",
      "the [escaped guide](docs/guide_\\(draft\\).md),",
      "and view ![the diagram](docs/flow_(wide).png \"Wide flow\").",
      "",
    ].join("\n"),
  );
  await writeFile(path.join(skillDir, "docs", "guide_(v2).md"), "# Guide\n");
  await writeFile(path.join(skillDir, "docs", "guide_(draft).md"), "# Draft\n");
  await writeFile(path.join(skillDir, "docs", "flow_(wide).png"), "fixture\n");

  const result = checkSkills(fixture);
  assert.equal(result.ok, true);
  assert.deepEqual(result.issues, []);

  const { stdout, stderr } = await execFileAsync("node", ["src/index.js", "check", fixture]);
  assert.equal(stderr, "");
  assert.match(stdout, /No drift found/);
});

test("skilldrift check reports missing parenthesized destinations in CLI JSON", async () => {
  const fixture = await mkdtemp(path.join(tmpdir(), "skilldrift-parentheses-missing-"));
  const skillDir = path.join(fixture, "review-skill");
  await mkdir(skillDir, { recursive: true });
  const target = "docs/missing_(v3).md?raw=1#intro";
  await writeFile(
    path.join(skillDir, "SKILL.md"),
    `# Review Skill\n\nRead [the guide](${target} \"Draft\") first.\n`,
  );

  await assert.rejects(
    execFileAsync("node", ["src/index.js", "check", fixture, "--json"]),
    (error) => {
      assert.equal(error.stderr, "");
      const report = JSON.parse(error.stdout);
      assert.equal(report.ok, false);
      assert.equal(report.issues[0].code, "missing-reference");
      assert.equal(report.issues[0].target, target);
      return true;
    },
  );
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

test("skilldrift check accepts optional titles for plain and angle-bracket destinations", async () => {
  const fixture = await mkdtemp(path.join(tmpdir(), "skilldrift-link-titles-valid-"));
  const skillDir = path.join(fixture, "review-skill");
  await mkdir(path.join(skillDir, "docs"), { recursive: true });
  await writeFile(
    path.join(skillDir, "SKILL.md"),
    [
      "# Review Skill",
      "",
      "[plain](docs/plain.md)",
      "[double](docs/double.md \"Double title\")",
      "[single](docs/single.md 'Single title')",
      "[parenthesized](docs/parenthesized.md (Parenthesized title))",
      "[angle plain](<docs/angle plain.md>)",
      "[angle double](<docs/angle double.md> \"Double title\")",
      "[angle single](<docs/angle single.md> 'Single title')",
      "[angle parenthesized](<docs/angle parenthesized.md> (Parenthesized title))",
      "",
    ].join("\n"),
  );

  for (const filename of [
    "plain.md",
    "double.md",
    "single.md",
    "parenthesized.md",
    "angle plain.md",
    "angle double.md",
    "angle single.md",
    "angle parenthesized.md",
  ]) {
    await writeFile(path.join(skillDir, "docs", filename), "# Guide\n");
  }

  const result = checkSkills(fixture);
  assert.equal(result.ok, true);
  assert.deepEqual(result.issues, []);

  const { stdout, stderr } = await execFileAsync("node", ["src/index.js", "check", fixture]);
  assert.equal(stderr, "");
  assert.match(stdout, /No drift found/);
});

test("skilldrift check reports only missing destinations for every optional title form", async () => {
  const fixture = await mkdtemp(path.join(tmpdir(), "skilldrift-link-titles-missing-"));
  const skillDir = path.join(fixture, "review-skill");
  await mkdir(skillDir, { recursive: true });
  const targets = [
    "docs/plain.md",
    "docs/double.md",
    "docs/single.md",
    "docs/parenthesized.md",
    "docs/angle plain.md",
    "docs/angle double.md",
    "docs/angle single.md",
    "docs/angle parenthesized.md",
  ];
  await writeFile(
    path.join(skillDir, "SKILL.md"),
    [
      "# Review Skill",
      "",
      "[plain](docs/plain.md)",
      "[double](docs/double.md \"Double title\")",
      "[single](docs/single.md 'Single title')",
      "[parenthesized](docs/parenthesized.md (Parenthesized title))",
      "[angle plain](<docs/angle plain.md>)",
      "[angle double](<docs/angle double.md> \"Double title\")",
      "[angle single](<docs/angle single.md> 'Single title')",
      "[angle parenthesized](<docs/angle parenthesized.md> (Parenthesized title))",
      "",
    ].join("\n"),
  );

  const result = checkSkills(fixture);
  assert.equal(result.ok, false);
  assert.deepEqual(result.issues.map((issue) => issue.target), targets);

  await assert.rejects(
    execFileAsync("node", ["src/index.js", "check", fixture, "--json"]),
    (error) => {
      assert.equal(error.stderr, "");
      const report = JSON.parse(error.stdout);
      assert.deepEqual(report.issues.map((issue) => issue.target), targets);
      assert.equal(error.stdout.includes("Double title"), false);
      assert.equal(error.stdout.includes("Single title"), false);
      assert.equal(error.stdout.includes("Parenthesized title"), false);
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
