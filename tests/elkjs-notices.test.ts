import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Script } from 'node:vm';
import test from 'node:test';
import config from '../next.config.mjs';

const projectDir = fileURLToPath(new URL('..', import.meta.url));

test('the production hook retains elkjs notices in client and server chunks', async () => {
  const distDir = await mkdtemp(join(tmpdir(), 'elkjs-notices-'));
  try {
    const files = ['static/chunks/elk.js', 'server/chunks/elk.js', 'static/chunks/other.js'];
    const code = 'globalThis.elkMessage = "Cannot construct an ELK";';
    for (const file of files) {
      await mkdir(dirname(join(distDir, file)), { recursive: true });
      await writeFile(join(distDir, file), file.includes('other') ? 'void 0;' : code);
    }
    const hook = config.compiler?.runAfterProductionCompile;
    assert.equal(typeof hook, 'function', 'production compilation must preserve elkjs notices');
    await hook!({ projectDir, distDir });
    const license = await readFile(join(projectDir, 'node_modules/elkjs/LICENSE.md'), 'utf8');
    for (const file of files.slice(0, 2)) {
      const output = await readFile(join(distDir, file), 'utf8');
      assert.ok(output.startsWith(code), 'existing JavaScript stays intact');
      for (const notice of [
        'Copyright (c) 2017 Kiel University and others.',
        'Copyright (c) 2021 Kiel University and others.',
        'Copyright (c) 2019 TypeFox and others.',
        'SPDX-License-Identifier: EPL-2.0 OR GPL-3.0-or-later',
        license,
      ]) assert.ok(output.includes(notice), `missing notice: ${notice.slice(0, 90)}`);
      new Script(output);
      await hook!({ projectDir, distDir });
      assert.equal(await readFile(join(distDir, file), 'utf8'), output, 'notice retention is idempotent');
    }
    assert.equal(await readFile(join(distDir, files[2]), 'utf8'), 'void 0;');
  } finally {
    await rm(distDir, { recursive: true, force: true });
  }
});

test('the production hook fails if it cannot locate the shipped elkjs code', async () => {
  const distDir = await mkdtemp(join(tmpdir(), 'elkjs-missing-'));
  try {
    const hook = config.compiler?.runAfterProductionCompile;
    assert.equal(typeof hook, 'function');
    await assert.rejects(hook!({ projectDir, distDir }), /elkjs.*chunk/i);
  } finally {
    await rm(distDir, { recursive: true, force: true });
  }
});
