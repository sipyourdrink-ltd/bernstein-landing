import { appendFile, readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';

async function filesUnder(directory) {
  let entries;
  try {
    entries = await readdir(directory, { withFileTypes: true });
  } catch (error) {
    if (error.code === 'ENOENT') return [];
    throw error;
  }
  const files = [];
  for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) files.push(...await filesUnder(path));
    else if (entry.isFile()) files.push(path);
  }
  return files;
}

// Turbopack strips elkjs's notice comments. Restore their original bytes after
// minification and before Next traces/copies its production output.
export async function preserveElkjsNotices({ projectDir, distDir }) {
  const packageDir = join(projectDir, 'node_modules/elkjs');
  const license = await readFile(join(packageDir, 'LICENSE.md'), 'utf8');
  if (license.includes('*/')) throw new Error('elkjs license cannot be embedded as a comment');
  const notices = new Set();
  for (const file of await filesUnder(packageDir)) {
    if (!file.endsWith('.js') && !file.endsWith('.d.ts')) continue;
    const source = await readFile(file, 'utf8');
    for (const [comment] of source.matchAll(/\/\*[\s\S]*?\*\//g)) {
      if (/copyright|licen[sc]e|SPDX/i.test(comment)) notices.add(comment);
    }
  }
  if (notices.size === 0) throw new Error('elkjs copyright notices were not found');
  const banner = `\n/*! elkjs third-party notices */\n${[...notices].join('\n')}\n/*\n${license}\n*/\n`;
  let retained = 0;
  for (const directory of ['static/chunks', 'server/chunks']) {
    for (const file of await filesUnder(join(distDir, directory))) {
      if (!file.endsWith('.js')) continue;
      const code = await readFile(file, 'utf8');
      if (!code.includes('Cannot construct an ELK') && !code.includes('org.eclipse.elk')) continue;
      if (!code.endsWith(banner)) await appendFile(file, banner);
      retained += 1;
    }
  }
  if (retained === 0) throw new Error('elkjs production chunk was not found');
  console.log(`elkjs: retained ${notices.size} notice blocks and LICENSE.md in ${retained} chunk(s)`);
}
