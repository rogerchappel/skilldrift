#!/usr/bin/env node

const help = `skilldrift

Early-stage local-first developer tool scaffold.

Usage:
  skilldrift --help
  skilldrift --version

The implementation is intentionally minimal while the project is pre-1.0.
See docs/PRD.md for planned scope.`;

const version = "0.1.0";
const arg = process.argv[2];

if (arg === "--version" || arg === "-v") {
  console.log(version);
} else {
  console.log(help);
}
