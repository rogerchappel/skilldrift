# PRD: skilldrift

Status: in-progress
Decision: build now
Factory run: 2026-05-29 PM

## Pitch

`skilldrift` audits agent skill folders for stale instructions, missing files, broken relative references, unsafe commands, and version drift. It keeps reusable agent skills boringly shippable. 🧰

## Source Attribution

Inspired by the 2026 study "Configuring Agentic AI Coding Tools: An Exploratory Study" and the rise of context files, skills, and subagents across Codex, Claude Code, Cursor, Gemini, and other agent tools. Reframed as a deterministic local skill-pack checker.

## Problem

Agent skills are becoming source assets, but they rot like docs: linked scripts disappear, examples drift, dangerous instructions sneak in, and metadata falls out of sync.

## V1 Scope

- TypeScript CLI package.
- `skilldrift check skills/`
- Discover `SKILL.md`, scripts, references, assets, and manifest files.
- Validate relative links, referenced scripts/assets, required sections, metadata, and command safety notes.
- Emit Markdown and JSON reports.
- Ship fixtures for healthy, missing-reference, unsafe-command, and stale-version skills.

## Out of Scope

- Running skills.
- Evaluating LLM output quality.
- Hosted skill registry.

## Verification

Run `npm test`, `npm run check`, `npm run build`, `npm run smoke`, `bash scripts/validate.sh`, and a fixture-backed CLI smoke.

