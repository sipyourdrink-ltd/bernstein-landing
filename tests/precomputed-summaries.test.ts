/**
 * Guard ensuring every blog post directory under `content/blog/` has a
 * complete operator-curated precomputed summary under
 * `content/notes/summaries/<slug>/index.mdx` with all three modes
 * (`quick`, `takeaways`, `technical`) carrying non-empty `title`,
 * `items`, and `whyItMatters`.
 *
 * Self-contained: imports only Node stdlib and `gray-matter` so it runs
 * identically in GitHub Actions CI (where host-local overlay modules
 * under `lib/blog-summary/` are absent) and in the deploy tree.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import matter from 'gray-matter';

const BLOG_DIR = path.resolve(process.cwd(), 'content', 'blog');
const SUMMARIES_DIR = path.resolve(process.cwd(), 'content', 'notes', 'summaries');
const REQUIRED_MODES = ['quick', 'takeaways', 'technical'] as const;
const MAX_ITEMS_PER_MODE = 6;

async function listBlogSlugs(): Promise<string[]> {
  const entries = await fs.readdir(BLOG_DIR, { withFileTypes: true });
  return entries
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();
}

test('every blog folder has a precomputed summary with quick, takeaways, and technical modes', async () => {
  const slugs = await listBlogSlugs();
  assert.ok(slugs.length > 0, `no blog post folders found in ${BLOG_DIR}`);

  const failures: string[] = [];

  for (const slug of slugs) {
    const summaryPath = path.join(SUMMARIES_DIR, slug, 'index.mdx');
    let raw: string;
    try {
      raw = await fs.readFile(summaryPath, 'utf8');
    } catch {
      failures.push(`${slug}: missing content/notes/summaries/${slug}/index.mdx`);
      continue;
    }

    const parsed = matter(raw);
    const modes = (parsed.data as Record<string, unknown>)?.summary_modes;
    if (!modes || typeof modes !== 'object' || Array.isArray(modes)) {
      failures.push(`${slug}: missing or invalid summary_modes block`);
      continue;
    }

    for (const mode of REQUIRED_MODES) {
      const block = (modes as Record<string, unknown>)[mode];
      if (!block || typeof block !== 'object' || Array.isArray(block)) {
        failures.push(`${slug}: missing summary_modes.${mode}`);
        continue;
      }

      const { title, items, whyItMatters } = block as Record<string, unknown>;
      if (typeof title !== 'string' || title.trim().length === 0) {
        failures.push(`${slug}.${mode}: title must be a non-empty string`);
      }
      if (
        !Array.isArray(items) ||
        items.length < 1 ||
        items.length > MAX_ITEMS_PER_MODE ||
        !items.every((item) => typeof item === 'string' && item.trim().length > 0)
      ) {
        failures.push(
          `${slug}.${mode}: items must be an array of 1..${MAX_ITEMS_PER_MODE} non-empty strings`,
        );
      }
      if (typeof whyItMatters !== 'string' || whyItMatters.trim().length === 0) {
        failures.push(`${slug}.${mode}: whyItMatters must be a non-empty string`);
      }
    }
  }

  assert.equal(
    failures.length,
    0,
    `precomputed summary check failed:\n  - ${failures.join('\n  - ')}`,
  );
});
