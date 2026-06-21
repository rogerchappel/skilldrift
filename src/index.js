#!/usr/bin/env node

import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

const version = "0.1.0";

const help = `skilldrift

Audit local agent skill folders for broken relative references.

Usage:
  skilldrift --help
  skilldrift --version
  skilldrift check <skills-dir> [--json]

Checks every SKILL.md below <skills-dir> and reports missing relative Markdown links.`;

function walkSkills(rootDir) {
  const found = [];
  const entries = readdirSync(rootDir, { withFileTypes: true });

  for (const entry of entries) {
    if (entry.name === ".git" || entry.name === "node_modules") {
      continue;
    }

    const fullPath = path.join(rootDir, entry.name);

    if (entry.isDirectory()) {
      found.push(...walkSkills(fullPath));
    } else if (entry.isFile() && entry.name === "SKILL.md") {
      found.push(fullPath);
    }
  }

  return found;
}

function isExternalReference(target) {
  return (
    target.startsWith("#") ||
    /^[a-z][a-z0-9+.-]*:/i.test(target)
  );
}

function normalizeLinkTarget(target) {
  const withoutAnchor = target.split("#")[0];
  return decodeURIComponent(withoutAnchor);
}

function markdownLinks(content) {
  const links = [];
  const pattern = /!?\[[^\]]*\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g;
  let match;

  while ((match = pattern.exec(content)) !== null) {
    links.push(match[1]);
  }

  return links;
}

export function checkSkills(rootDir) {
  const resolvedRoot = path.resolve(rootDir);
  const issues = [];

  if (!existsSync(resolvedRoot)) {
    return {
      ok: false,
      root: resolvedRoot,
      skills: [],
      issues: [
        {
          file: resolvedRoot,
          code: "missing-root",
          message: "Skills directory does not exist.",
        },
      ],
    };
  }

  if (!statSync(resolvedRoot).isDirectory()) {
    return {
      ok: false,
      root: resolvedRoot,
      skills: [],
      issues: [
        {
          file: resolvedRoot,
          code: "not-directory",
          message: "Skills path is not a directory.",
        },
      ],
    };
  }

  const skills = walkSkills(resolvedRoot);

  if (skills.length === 0) {
    issues.push({
      file: resolvedRoot,
      code: "no-skills",
      message: "No SKILL.md files were found.",
    });
  }

  for (const skillFile of skills) {
    const content = readFileSync(skillFile, "utf8");
    const skillDir = path.dirname(skillFile);

    if (!content.trimStart().startsWith("#")) {
      issues.push({
        file: skillFile,
        code: "missing-title",
        message: "SKILL.md should start with a Markdown heading.",
      });
    }

    for (const target of markdownLinks(content)) {
      if (isExternalReference(target)) {
        continue;
      }

      const normalized = normalizeLinkTarget(target);
      if (normalized === "") {
        continue;
      }

      const referencedPath = path.resolve(skillDir, normalized);
      if (!existsSync(referencedPath)) {
        issues.push({
          file: skillFile,
          code: "missing-reference",
          target,
          message: `Referenced file does not exist: ${target}`,
        });
      }
    }
  }

  return {
    ok: issues.length === 0,
    root: resolvedRoot,
    skills,
    issues,
  };
}

function formatMarkdownReport(result) {
  const lines = [
    `skilldrift checked ${result.skills.length} skill file${result.skills.length === 1 ? "" : "s"}.`,
  ];

  if (result.ok) {
    lines.push("No drift found.");
    return lines.join("\n");
  }

  lines.push("");
  for (const issue of result.issues) {
    lines.push(`- ${issue.code}: ${issue.message} (${issue.file})`);
  }

  return lines.join("\n");
}

function run(argv) {
  const [arg, target, ...rest] = argv;

  if (arg === "--version" || arg === "-v") {
    console.log(version);
    return 0;
  }

  if (arg === "check") {
    const result = checkSkills(target ?? ".");

    if (rest.includes("--json")) {
      console.log(JSON.stringify(result, null, 2));
    } else {
      console.log(formatMarkdownReport(result));
    }

    return result.ok ? 0 : 1;
  }

  console.log(help);
  return 0;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  process.exitCode = run(process.argv.slice(2));
}
