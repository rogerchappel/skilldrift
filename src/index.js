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
  const unescapedParentheses = withoutSuffix.replace(/\\([()])/g, "$1");
  try {
    return decodeURIComponent(unescapedParentheses);
  } catch {
    return unescapedParentheses;
  }
}

function startsWithAtxHeading(content) {
  return /^#{1,6}(?:[ \t]+|(?:\r?\n|$))/.test(content);
}

function withoutFencedCode(content) {
  let openFence;

  return content.replace(/^.*(?:\r?\n|$)/gm, (line) => {
    if (line === "") {
      return line;
    }

    if (openFence) {
      const closing = /^ {0,3}(`+|~+)[ \t]*(?:\r?\n|$)/.exec(line);
      if (
        closing &&
        closing[1][0] === openFence.marker &&
        closing[1].length >= openFence.length
      ) {
        openFence = undefined;
      }
      return line.replace(/[^\r\n]/g, " ");
    }

    const opening = /^ {0,3}(`{3,}|~{3,})([^\r\n]*)(?:\r?\n|$)/.exec(line);
    if (opening && !(opening[1][0] === "`" && opening[2].includes("`"))) {
      openFence = { marker: opening[1][0], length: opening[1].length };
      return line.replace(/[^\r\n]/g, " ");
    }

    return line;
  });
}

function maskLine(line) {
  return line.replace(/[^\r\n]/g, " ");
}

function withoutIndentedCode(content) {
  let inBlock = false;
  let previousBlank = true;

  return content.replace(/^.*(?:\r?\n|$)/gm, (line) => {
    if (line === "") {
      return line;
    }

    const blank = /^[ \t]*(?:\r?\n|$)/.test(line);
    const indented = /^(?: {4}|\t)/.test(line);

    if (inBlock) {
      if (blank || indented) {
        previousBlank = blank;
        return maskLine(line);
      }
      inBlock = false;
    }

    if (indented && previousBlank) {
      inBlock = true;
      previousBlank = false;
      return maskLine(line);
    }

    previousBlank = blank;
    return line;
  });
}

function isEscaped(content, index) {
  let backslashes = 0;
  for (let cursor = index - 1; cursor >= 0 && content[cursor] === "\\"; cursor -= 1) {
    backslashes += 1;
  }
  return backslashes % 2 === 1;
}

function withoutInlineCode(content) {
  const masked = [...content];
  let cursor = 0;

  while (cursor < content.length) {
    if (content[cursor] !== "`" || isEscaped(content, cursor)) {
      cursor += 1;
      continue;
    }

    let openingEnd = cursor;
    while (content[openingEnd] === "`") {
      openingEnd += 1;
    }
    const markerLength = openingEnd - cursor;
    let closingStart = openingEnd;

    while (closingStart < content.length) {
      if (content[closingStart] !== "`" || isEscaped(content, closingStart)) {
        closingStart += 1;
        continue;
      }

      let closingEnd = closingStart;
      while (content[closingEnd] === "`") {
        closingEnd += 1;
      }
      if (closingEnd - closingStart === markerLength) {
        for (let index = cursor; index < closingEnd; index += 1) {
          if (content[index] !== "\n" && content[index] !== "\r") {
            masked[index] = " ";
          }
        }
        cursor = closingEnd;
        break;
      }
      closingStart = closingEnd;
    }

    if (closingStart >= content.length) {
      cursor = openingEnd;
    }
  }

  return masked.join("");
}

function withoutCodeContexts(content) {
  return withoutInlineCode(withoutIndentedCode(withoutFencedCode(content)));
}

function markdownLinks(content) {
  const links = [];
  const pattern = /!?\[[^\]]*\]\(\s*/g;
  const fencedContent = withoutCodeContexts(content);
  let match;

  while ((match = pattern.exec(fencedContent)) !== null) {
    let cursor = pattern.lastIndex;
    let target = "";

    if (fencedContent[cursor] === "<") {
      const closingBracket = fencedContent.indexOf(">", cursor + 1);
      if (closingBracket === -1 || fencedContent.slice(cursor + 1, closingBracket).includes("\n")) {
        continue;
      }
      target = fencedContent.slice(cursor + 1, closingBracket);
      cursor = closingBracket + 1;
    } else {
      let depth = 0;
      while (cursor < fencedContent.length) {
        const character = fencedContent[cursor];
        if (character === "\\" && cursor + 1 < fencedContent.length) {
          target += character + fencedContent[cursor + 1];
          cursor += 2;
          continue;
        }
        if (character === "(") {
          depth += 1;
        } else if (character === ")") {
          if (depth === 0) {
            break;
          }
          depth -= 1;
        } else if (/\s/.test(character)) {
          break;
        }
        target += character;
        cursor += 1;
      }
    }

    const closing = /^(?:\s+(?:"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|\((?:\\.|[^)\\])*\)))?\s*\)/.exec(
      fencedContent.slice(cursor),
    );
    if (target !== "" && closing) {
      links.push(target);
      pattern.lastIndex = cursor + closing[0].length;
    }
  }

  const definitions = new Map();
  const definitionLines = [];
  const definitionPattern = /^ {0,3}\[([^\]]+)\]:[ \t]*(?:<([^>\r\n]+)>|(\S+))(?:[ \t]+(?:"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|\((?:\\.|[^)\\])*\)))?[ \t]*(?:\r?\n|$)/gm;

  while ((match = definitionPattern.exec(fencedContent)) !== null) {
    const label = normalizeReferenceLabel(match[1]);
    if (!definitions.has(label)) {
      definitions.set(label, match[2] ?? match[3]);
    }
    definitionLines.push([match.index, definitionPattern.lastIndex]);
  }

  const referenceContent = [...fencedContent];
  for (const [start, end] of definitionLines) {
    for (let index = start; index < end; index += 1) {
      if (referenceContent[index] !== "\n" && referenceContent[index] !== "\r") {
        referenceContent[index] = " ";
      }
    }
  }

  const referencedLabels = [];
  const explicitReferences = /!?\[([^\]]+)\]\[([^\]]*)\]/g;
  const maskedReferences = referenceContent.join("");
  while ((match = explicitReferences.exec(maskedReferences)) !== null) {
    referencedLabels.push(normalizeReferenceLabel(match[2] || match[1]));
    for (let index = match.index; index < explicitReferences.lastIndex; index += 1) {
      referenceContent[index] = " ";
    }
  }

  const shortcutReferences = /!?\[([^\]]+)\](?!\s*\()/g;
  const shortcutContent = referenceContent.join("");
  while ((match = shortcutReferences.exec(shortcutContent)) !== null) {
    referencedLabels.push(normalizeReferenceLabel(match[1]));
  }

  const seenLabels = new Set();
  for (const label of referencedLabels) {
    if (!seenLabels.has(label) && definitions.has(label)) {
      links.push(definitions.get(label));
      seenLabels.add(label);
    }
  }

  return links;
}

function normalizeReferenceLabel(label) {
  return label.trim().replace(/\s+/g, " ").toLowerCase();
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

    if (!startsWithAtxHeading(skillBody(content))) {
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
