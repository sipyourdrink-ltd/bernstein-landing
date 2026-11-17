import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { execFileSync } from 'node:child_process';

test('fresh adapter extraction includes factory profiles and excludes placeholders', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'landing-adapter-test-'));
  try {
    const site = path.join(root, 'site');
    const upstream = path.join(root, 'upstream');
    const adapters = path.join(upstream, 'src/bernstein/adapters');
    await fs.mkdir(adapters, { recursive: true });
    await fs.mkdir(path.join(site, 'scripts'), { recursive: true });
    await fs.mkdir(path.join(site, 'lib'), { recursive: true });
    await fs.copyFile('scripts/extract-adapters.mjs', path.join(site, 'scripts/extract-adapters.mjs'));
    await fs.copyFile('lib/adapter-count-core.mjs', path.join(site, 'lib/adapter-count-core.mjs'));
    await fs.writeFile(path.join(adapters, 'registry.py'), `from bernstein.adapters.claude import ClaudeAdapter
from bernstein.adapters.generic import GenericAdapter
from bernstein.adapters.mock import MockAdapter
_ADAPTERS: dict = {
    "claude": ClaudeAdapter,
    "generic": GenericAdapter,
    "mock": MockAdapter,
}
_ADAPTERS.update(profile_built_adapter_classes())
`);
    await fs.writeFile(path.join(adapters, 'claude.py'), '"""Claude CLI adapter."""\n');
    await fs.writeFile(path.join(adapters, 'generic.py'), '"""Generic placeholder."""\n');
    await fs.writeFile(path.join(adapters, 'mock.py'), '"""Mock placeholder."""\n');
    await fs.writeFile(path.join(adapters, 'capability_profile.py'), `_PROFILE_LIST = (
    AdapterCapabilityProfile(
        name="pydantic_ai",
        display_name="Pydantic AI",
        implementation=ProfileImplementation.FACTORY,
    ),
    AdapterCapabilityProfile(
        name="claude",
        display_name="Claude",
        implementation=ProfileImplementation.MODULE,
    ),
)
`);
    execFileSync(process.execPath, [path.join(site, 'scripts/extract-adapters.mjs')], {
      env: { ...process.env, BERNSTEIN_REPO: upstream }, stdio: 'pipe',
    });
    const output = JSON.parse(await fs.readFile(path.join(site, 'data/adapters.json'), 'utf8'));
    assert.deepEqual(output.adapters.map((entry: { slug: string }) => entry.slug), ['claude', 'pydantic-ai']);
    const profile = output.adapters.find((entry: { slug: string }) => entry.slug === 'pydantic-ai');
    assert.equal(profile.displayName, 'Pydantic AI');
    assert.equal(profile.sourceFile, 'src/bernstein/adapters/capability_profile.py');
    assert.equal(profile.cls, 'PydanticAiProfileAdapter');
    assert.match(profile.docstring, /Pydantic AI/);
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});
