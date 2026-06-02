# Orchestration Plan

## Release Checks

- Run `npm test`, `npm run build`, and `npm run smoke` before release.
- Keep the release dry-run workflow aligned with local `npm run release:check`.

## Implementation Flow

- Use `docs/PRD.md` as the source of planned scope.
- Land small increments with tests and README updates.
- Treat this package as pre-1.0 until examples and behavior are implemented.
