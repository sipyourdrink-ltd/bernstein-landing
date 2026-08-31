/**
 * /.well-known/agent-skills/index.json is a promise with a checksum in
 * it: each entry names a SKILL.md artifact by URL and pins its exact
 * bytes with a sha256 digest. A digest that no longer matches the file
 * is worse than a 404 - a client that verifies will treat the artifact
 * as tampered with. So the index is asserted against the artifacts in
 * this repository on every test run: edit a SKILL.md and the digest
 * here must be regenerated in the same change.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

const PUBLIC_DIR = path.resolve(process.cwd(), 'public');
const INDEX_PATH = path.join(PUBLIC_DIR, '.well-known', 'agent-skills', 'index.json');

interface SkillEntry {
  name: string;
  type: string;
  description: string;
  url: string;
  digest: string;
}

function loadIndex(): { $schema: string; skills: SkillEntry[] } {
  return JSON.parse(fs.readFileSync(INDEX_PATH, 'utf8'));
}

test('declares the discovery schema and at least one skill', () => {
  const index = loadIndex();

  assert.equal(index.$schema, 'https://schemas.agentskills.io/discovery/0.2.0/schema.json');
  assert.ok(index.skills.length > 0);

  for (const skill of index.skills) {
    assert.match(skill.name, /^[a-z0-9]+(-[a-z0-9]+)*$/);
    assert.equal(skill.type, 'skill-md');
    assert.ok(skill.description, `${skill.name} has no description`);
    assert.match(skill.url, /^https:\/\/bernstein\.run\//);
    assert.match(skill.digest, /^sha256:[0-9a-f]{64}$/);
  }
});

test('every artifact URL is a file this repository serves', () => {
  for (const skill of loadIndex().skills) {
    const relative = new URL(skill.url).pathname.replace(/^\//, '');
    const file = path.join(PUBLIC_DIR, relative);
    assert.ok(fs.existsSync(file), `${skill.url} has nothing serving it`);
  }
});

test('every digest matches the artifact bytes', () => {
  for (const skill of loadIndex().skills) {
    const relative = new URL(skill.url).pathname.replace(/^\//, '');
    const bytes = fs.readFileSync(path.join(PUBLIC_DIR, relative));
    const digest = `sha256:${createHash('sha256').update(bytes).digest('hex')}`;
    assert.equal(digest, skill.digest, `${skill.name}: index digest is stale - regenerate it`);
  }
});

test('artifacts carry the frontmatter name they are indexed under', () => {
  for (const skill of loadIndex().skills) {
    const relative = new URL(skill.url).pathname.replace(/^\//, '');
    const body = fs.readFileSync(path.join(PUBLIC_DIR, relative), 'utf8');
    assert.ok(body.startsWith('---\n'), `${skill.url} has no YAML frontmatter`);
    assert.ok(
      body.includes(`name: ${skill.name}`),
      `${skill.url} frontmatter name does not match index entry "${skill.name}"`,
    );
  }
});
