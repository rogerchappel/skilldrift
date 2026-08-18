import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('Node workflows require the committed lockfile', async () => {
  const workflows = await Promise.all([
    read('.github/workflows/ci.yml'),
    read('.github/workflows/release-dry-run.yml'),
    read('.github/workflows/release.yml'),
  ]);

  for (const workflow of workflows) {
    assert.match(workflow, /^\s+(?:run: )?npm ci$/m);
    assert.doesNotMatch(workflow, /npm install\s*$/m);
  }
});

test('tag release tests, publishes, and attaches one identified tarball in order', async () => {
  const workflow = await read('.github/workflows/release.yml');
  const build = workflow.indexOf('npm pack --json');
  const smoke = workflow.indexOf('Smoke test packaged CLI');
  const publish = workflow.indexOf('npm publish "$TARBALL" --provenance --access public');
  const release = workflow.indexOf('gh release create');

  assert.ok(build >= 0 && build < smoke);
  assert.ok(smoke < publish && publish < release);
  assert.match(workflow, /TARBALL: \$\{\{ steps\.package\.outputs\.tarball \}\}/g);
  assert.match(workflow, /gh release create[^\n]+"\$TARBALL"/);
  assert.doesNotMatch(workflow, /gh release create[^\n]+\*\.tgz/);
});

test('pull-request and dry-run workflows cannot publish', async () => {
  const [ci, dryRun] = await Promise.all([
    read('.github/workflows/ci.yml'),
    read('.github/workflows/release-dry-run.yml'),
  ]);

  assert.doesNotMatch(ci, /npm publish|gh release create/);
  assert.doesNotMatch(dryRun, /npm publish|gh release create/);
  assert.match(dryRun, /npm run release:check/);
  assert.match(dryRun, /ReleaseBox readiness check/);
});
