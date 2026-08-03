#!/usr/bin/env node

import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const version = "0.1.0";

export const help = `skilldrift

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
  const withoutSuffix = target.split(/[?#]/, 1)[0];
  try {
    return decodeURIComponent(withoutSuffix);
  } catch {
    return withoutSuffix;
  }
}

function markdownLinks(content) {
  const links = [];
  const pattern = /!?\[[^\]]*\]\(\s*(?:<([^>\n]*)>|([^\s)]+))(?:\s+"[^"]*")?\s*\)/g;
  let match;

  while ((match = pattern.exec(content)) !== null) {
    links.push(match[1] ?? match[2]);
  }

  return links;
}

function skillBody(content) {
  const trimmed = content.trimStart();

  if (!/^---[ \t]*(?:\r?\n|$)/.test(trimmed)) {
    return trimmed;
  }

  const openingEnd = trimmed.indexOf("\n");
  if (openingEnd === -1) {
    return "";
  }

  const remainder = trimmed.slice(openingEnd + 1);
  const closing = /^(?:---|\.\.\.)[ \t]*(?:\r?\n|$)/m.exec(remainder);
  if (!closing) {
    return "";
  }

  return remainder.slice(closing.index + closing[0].length).trimStart();
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

    if (!skillBody(content).startsWith("#")) {
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

function usageError(message, errorLog) {
  errorLog(`skilldrift: ${message}\n\n${help}`);
  return 2;
}

export function run(
  argv = process.argv.slice(2),
  log = console.log,
  errorLog = console.error,
) {
  const [arg, target, ...rest] = argv;

  if (
    argv.length === 0 ||
    ((arg === "--help" || arg === "-h") && target === undefined)
  ) {
    log(help);
    return 0;
  }

  if ((arg === "--version" || arg === "-v") && target === undefined) {
    log(version);
    return 0;
  }

  if (arg === "check") {
    if (target === undefined || target === "--json") {
      return usageError("missing <skills-dir> for 'check'", errorLog);
    }

    if (target.startsWith("-")) {
      return usageError(`unknown option '${target}'`, errorLog);
    }

    const invalidArgument = rest.find((value) => value !== "--json");
    const duplicateJson = rest.filter((value) => value === "--json").length > 1;
    if (invalidArgument !== undefined) {
      const kind = invalidArgument.startsWith("-")
        ? "unknown option"
        : "unexpected argument";
      return usageError(`${kind} '${invalidArgument}'`, errorLog);
    }
    if (duplicateJson) {
      return usageError("option '--json' may only be specified once", errorLog);
    }

    const result = checkSkills(target);

    if (rest.includes("--json")) {
      log(JSON.stringify(result, null, 2));
    } else {
      log(formatMarkdownReport(result));
    }

    return result.ok ? 0 : 1;
  }

  if (
    target !== undefined &&
    (arg === "--help" || arg === "-h" || arg === "--version" || arg === "-v")
  ) {
    return usageError(`unexpected argument '${target}'`, errorLog);
  }

  return usageError(`unknown command '${arg}'`, errorLog);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  process.exitCode = run(process.argv.slice(2));
}
