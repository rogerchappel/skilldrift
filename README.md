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

The checker exits with status `0` when no drift is found and status `1` when it finds missing skill files, missing `SKILL.md` headings, or broken relative links such as `scripts/check.sh`. A `SKILL.md` may start with YAML frontmatter delimited by `---` (or closed by `...`); its first body content must then be a Markdown heading. Unclosed frontmatter is treated as a missing title. Local destinations may use angle brackets when their paths contain spaces, for example `<docs/review guide.md>`. Malformed percent escapes are treated as literal path text and reported as missing references instead of terminating the check.

For automation, emit JSON:

```sh
npx skilldrift check ./skills --json
```

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
- It does not execute skill scripts, evaluate instruction quality, or validate hosted registries.
- Links that use absolute URLs, URI schemes, or same-page anchors are ignored.

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for contribution expectations. Changes should be small, reviewable, and verified before review.

## Security

See [SECURITY.md](SECURITY.md) for vulnerability reporting guidance.

## License

MIT
