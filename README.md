# skilldrift

Skill drift detection for reusable agent skills and local playbooks.

## Status

This repository now contains a small first-pass checker for local skill folders. It finds `SKILL.md` files and reports missing relative Markdown links so skill authors can catch stale script, reference, and asset paths before sharing a skill.

## Install

For local development:

```sh
npm install
```

Published package installation is not yet part of the release contract.

## Use

Check a folder that contains one or more agent skills:

```sh
npx skilldrift check ./skills
```

The checker exits with status `0` when no drift is found and status `1` when it finds missing skill files, missing `SKILL.md` headings, or broken relative links such as `scripts/check.sh`. A `SKILL.md` may start with YAML frontmatter delimited by `---` (or closed by `...`); its first body content must then be a Markdown heading. Unclosed frontmatter is treated as a missing title. Links shown as examples inside inline code spans, CommonMark indented code blocks, or valid backtick or tilde fenced code blocks are ignored. This includes unclosed fences; closing fences must use the opening marker and at least as many marker characters. Local destinations may use angle brackets when their paths contain spaces, for example `<docs/review guide.md>`, and may contain balanced or backslash-escaped parentheses, such as `docs/guide_(v2).md` or `docs/guide_\(draft\).md`. Query strings and fragments are removed before percent-decoding and resolving local paths, so destinations such as `docs/guide.md?raw=1#intro` check `docs/guide.md`. Malformed percent escapes in a path are treated as literal text and reported as missing references instead of terminating the check.

For automation, emit JSON:

```sh
npx skilldrift check ./skills --json
```

Use `npx skilldrift --help` to print the command summary or
`npx skilldrift --version` to print the installed version. Invalid commands,
unsupported options, and missing or extra operands print a diagnostic and the
usage summary to standard error, then exit with status `2`.

## Verify

Run the available repository checks before opening a pull request:

```sh
npm test
```

Run the broader release-readiness gate before opening a release PR:

```sh
npm run release:check
```

## Limitations

- The first checker only validates local Markdown links in `SKILL.md` files.
- Link discovery is intentionally limited to inline Markdown links and images; reference-style links are not checked yet.
- It does not execute skill scripts, evaluate instruction quality, or validate hosted registries.
- Links that use absolute URLs, URI schemes, or same-page anchors are ignored.

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for contribution expectations. Changes should be small, reviewable, and verified before review.

## Security

See [SECURITY.md](SECURITY.md) for vulnerability reporting guidance.

## License

MIT
