#!/usr/bin/env node

import { fileURLToPath } from "node:url";

export const help = `skilldrift

Early-stage local-first developer tool scaffold.

Usage:
  skilldrift --help
  skilldrift --version

The implementation is intentionally minimal while the project is pre-1.0.
See docs/PRD.md for planned scope.`;

export const version = "0.1.0";

export function run(argv = process.argv.slice(2), log = console.log) {
  const arg = argv[0];

  if (arg === "--version" || arg === "-v") {
    log(version);
    return;
  }

  log(help);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  run();
}
