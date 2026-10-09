import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

// next-mdx-remote 6 compiles with blockJS on: JSX attribute expressions such as
// chart={`...`} are removed, so <Mermaid> received no chart and rendered an empty
// box with no error. A string attribute survives; this pins every diagram to one.
function mdxFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    return statSync(p).isDirectory() ? mdxFiles(p) : p.endsWith('.mdx') ? [p] : [];
  });
}

test('every <Mermaid> in content passes its chart as a string attribute, not a JS expression', () => {
  const offenders: string[] = [];
  let diagrams = 0;
  for (const file of mdxFiles('content')) {
    const src = readFileSync(file, 'utf8');
    // Diagram sources contain `-->`, so the tag cannot be cut at the first `>`.
    for (const m of src.matchAll(/<Mermaid\b\s*chart=(.)/g)) {
      diagrams += 1;
      if (m[1] !== "'" && m[1] !== '"') offenders.push(file);
    }
  }
  assert.ok(diagrams > 0, 'expected at least one <Mermaid> diagram in content/');
  assert.deepEqual(offenders, [], `chart must be a quoted string (blockJS strips {expressions}): ${offenders.join(', ')}`);
});
