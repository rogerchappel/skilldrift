# skilldrift

Skill drift detection for reusable agent skills and local playbooks.

## Status

This repository is currently an early implementation scaffold. It contains project governance, product notes, release hygiene files, and a minimal CLI that reports help/version output while the drift analysis workflow is still being built. Treat it as not ready for production use until the planned analyzer and real-world examples land.

## Install

For local stewardship or planning work, install dependencies from a checkout:

```sh
npm install
```

## CLI

The current CLI is intentionally small and only exposes scaffold metadata:

```sh
npm run smoke
node src/index.js --help
node src/index.js --version
```

Start with the planning material in `docs/PRD.md` and `ROADMAP.md` before extending package entry points.

## Verify

Run the available repository checks before opening a pull request:

```sh
npm test
```

If `release:check` exists in `package.json`, run it as the broader release-readiness gate:

```sh
npm run release:check
```

## Limitations

- The package entry points are placeholders until an implementation is added.
- README examples should be updated with real commands before any release claim is made.
- Security and production posture should be reassessed after the first implementation lands.

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for contribution expectations. Changes should be small, reviewable, and verified before review.

## Security

See [SECURITY.md](SECURITY.md) for vulnerability reporting guidance.

## License

MIT
