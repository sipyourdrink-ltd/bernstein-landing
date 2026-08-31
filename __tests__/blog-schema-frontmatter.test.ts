/**
 * Validates the schemaType / howToSteps / techDependencies frontmatter
 * added for HowTo / TechArticle structured data on blog posts.
 *
 * What we check:
 *  - Every post with `schemaType: HowTo` carries a non-empty
 *    `howToSteps` array.
 *  - Every post with `schemaType: TechArticle` carries a non-empty
 *    `techDependencies` array.
 *  - The serialised variable JSON-LD payload stays under the 5 KB
 *    ceiling Google uses for de-prioritisation.
 *  - `dateModified` is a valid ISO date when present and never
 *    pre-dates publish date.
 *  - HowTo step `text` stays under a soft 320-char cap so the total
 *    schema block fits the size envelope.
 *
 * Mirrors the existing __tests__/json-ld-why-bernstein.test.ts style —
 * node:test + assert/strict, no test framework deps.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import matter from 'gray-matter';

const BLOG_DIR = path.resolve(process.cwd(), 'content', 'blog');
const MAX_JSONLD_BYTES = 5 * 1024;
const SOFT_STEP_TEXT_CAP = 320;

type Frontmatter = {
  date: string;
  dateModified?: string;
  schemaType?: 'HowTo' | 'TechArticle' | 'BlogPosting';
  howToSteps?: Array<{ name: string; text: string }>;
  techDependencies?: string[];
};

async function listPostSlugs(): Promise<string[]> {
  const entries = await fs.readdir(BLOG_DIR, { withFileTypes: true });
  return entries.filter((e) => e.isDirectory()).map((e) => e.name);
}

async function loadFrontmatter(slug: string): Promise<Frontmatter> {
  const raw = await fs.readFile(path.join(BLOG_DIR, slug, 'index.mdx'), 'utf8');
  return matter(raw).data as Frontmatter;
}

function isValidISODate(value: string): boolean {
  const d = new Date(value);
  return !Number.isNaN(d.getTime());
}

test('every HowTo post carries howToSteps', async () => {
  const slugs = await listPostSlugs();
  for (const slug of slugs) {
    const fm = await loadFrontmatter(slug);
    if (fm.schemaType !== 'HowTo') continue;
    assert.ok(
      fm.howToSteps && fm.howToSteps.length >= 2,
      `${slug}: schemaType=HowTo requires at least 2 howToSteps`,
    );
    for (const step of fm.howToSteps) {
      assert.ok(step.name.trim().length > 0, `${slug}: step name empty`);
      assert.ok(step.text.trim().length > 0, `${slug}: step text empty`);
      assert.ok(
        step.text.length <= SOFT_STEP_TEXT_CAP,
        `${slug}: step text ${step.text.length} chars exceeds soft cap ${SOFT_STEP_TEXT_CAP}`,
      );
    }
  }
});

test('every TechArticle post carries techDependencies', async () => {
  const slugs = await listPostSlugs();
  for (const slug of slugs) {
    const fm = await loadFrontmatter(slug);
    if (fm.schemaType !== 'TechArticle') continue;
    assert.ok(
      fm.techDependencies && fm.techDependencies.length >= 1,
      `${slug}: schemaType=TechArticle requires at least 1 techDependency`,
    );
    for (const dep of fm.techDependencies) {
      assert.ok(dep.trim().length > 0, `${slug}: empty techDependency`);
    }
  }
});

test('serialised JSON-LD stays under the 5 KB per-post ceiling', async () => {
  const slugs = await listPostSlugs();
  for (const slug of slugs) {
    const fm = await loadFrontmatter(slug);
    if (!fm.schemaType || fm.schemaType === 'BlogPosting') continue;
    /* Approximate the rendered block: schemaType-specific arrays are
       the variable-weight payload; everything else (publisher, author,
       headline) is fixed boilerplate well under 1 KB. We measure the
       variable payload we control plus a 1 KB boilerplate budget so
       the total stays under the 5 KB Google de-prioritisation
       threshold. */
    const variablePayload = JSON.stringify({
      schemaType: fm.schemaType,
      howToSteps: fm.howToSteps ?? null,
      techDependencies: fm.techDependencies ?? null,
    });
    const totalBudget = Buffer.byteLength(variablePayload, 'utf8') + 1024;
    assert.ok(
      totalBudget < MAX_JSONLD_BYTES,
      `${slug}: variable JSON-LD + boilerplate payload exceeds 5 KB ceiling`,
    );
  }
});

test('dateModified parses as ISO and never pre-dates date', async () => {
  const slugs = await listPostSlugs();
  for (const slug of slugs) {
    const fm = await loadFrontmatter(slug);
    if (!fm.dateModified) continue;
    assert.ok(
      isValidISODate(fm.dateModified),
      `${slug}: dateModified ${fm.dateModified} is not a valid ISO date`,
    );
    assert.ok(
      fm.dateModified >= fm.date,
      `${slug}: dateModified ${fm.dateModified} predates date ${fm.date}`,
    );
  }
});

test('schemaType enum is one of the three allowed values when set', async () => {
  const allowed = new Set(['HowTo', 'TechArticle', 'BlogPosting']);
  const slugs = await listPostSlugs();
  for (const slug of slugs) {
    const fm = await loadFrontmatter(slug);
    if (!fm.schemaType) continue;
    assert.ok(
      allowed.has(fm.schemaType),
      `${slug}: schemaType ${fm.schemaType} is not in {HowTo, TechArticle, BlogPosting}`,
    );
  }
});
