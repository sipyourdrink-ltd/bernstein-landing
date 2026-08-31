/**
 * Voice-banned-words lint.
 *
 * The site voice rules exclude a set of buzzwords that read like
 * AI-generated filler. This test is a CI guard against regressions: if
 * any user-facing page or component string contains a banned word, this
 * test fails and points at the offending file.
 *
 * Files in scope:
 *   - app/page.tsx (homepage server component)
 *   - app/why-bernstein/page.tsx (decision-support page)
 *   - app/cost/page.tsx (token-bill calculator)
 *   - components/landing/* (landing surfaces)
 *   - content/evaluation/index.mdx (why-bernstein body content)
 *
 * Files out of scope:
 *   - app/sponsors/*
 *   - components/landing/SponsorWall.tsx
 *   - README.md
 *   - .github/FUNDING.yml
 *
 * Banned-word treatment:
 *   - Words that ALSO have legitimate technical use in this codebase
 *     ("robust" as in "robust against partial failure", "harness" as in
 *     test harness, "transform" as in CSS transform) are NOT in the
 *     hard-fail set. They are listed as soft warnings; the assertion
 *     does not fail on them.
 *   - Words that have NO legitimate use in landing copy (delve,
 *     leverage, empower, showcase, tapestry, "navigate the
 *     complexities", "in conclusion", "thrilled to announce", "just
 *     wanted to reach out") fail the test if they appear anywhere in
 *     the in-scope surfaces.
 *
 * Comment-skipping: the regex skips lines that start with `*` or `//`
 * (file headers and inline comments). It also skips lines whose first
 * non-whitespace character is `/* ` — block-comment continuations.
 * This means a banned word inside a docstring is allowed; only words
 * in real code (jsx text, props, string literals) trigger a fail.
 *
 * Dash guard: the voice rules also exclude the em-dash and its
 * relatives from visible copy; an ASCII hyphen, comma, colon or
 * semicolon carries the same break. That rule had no test, so the dash
 * kept coming back on new surfaces. The third test below fails on any
 * of U+2013 / U+2014 / U+2015 in the same files plus `app/vs`, and it
 * tracks block comments across lines rather than guessing per line, so
 * a dash in a comment (including a continuation line that does not
 * start with `*`) is still allowed and only visible copy fails.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';

const REPO_ROOT = process.cwd();

/* In-scope file globs. We resolve them at test time so a new file
 * dropped into one of these directories is immediately covered. */
const SCOPE_FILES: string[] = [
  'app/page.tsx',
  'app/why-bernstein/page.tsx',
  'app/cost/page.tsx',
  'content/evaluation/index.mdx',
];

const SCOPE_DIRS: string[] = [
  'components/landing',
  'components/cost',
];

/* Extra directories the dash guard covers. The banned-word list is
   tuned for the landing copy; the dash rule applies to every visible
   string we ship, so the comparison pages are in scope for it. */
const DASH_ONLY_DIRS: string[] = [
  'app/vs',
];

/* Dash characters that must not appear in visible copy: en dash
   (U+2013), em dash (U+2014), horizontal bar (U+2015). Built from code
   points rather than pasted literals so this file stays ASCII and a
   repo-wide grep for the dash does not trip over its own guard. ASCII
   hyphen is the substitute, or a comma / colon / semicolon where the
   sentence wants a real break. */
const BANNED_DASHES: { char: string; name: string }[] = [
  { char: String.fromCharCode(0x2013), name: 'en dash U+2013' },
  { char: String.fromCharCode(0x2014), name: 'em dash U+2014' },
  { char: String.fromCharCode(0x2015), name: 'horizontal bar U+2015' },
];

/* Files inside SCOPE_DIRS to deliberately skip:
 *   - SponsorWall.tsx (out of scope, see above)
 *   - any *.test.* (tests reference banned words for the lint itself)
 */
const SKIP_FILE_PATTERNS = [
  /SponsorWall\.tsx$/,
  /\.test\.[tj]sx?$/,
];

/* Hard-fail banned words. NO legitimate use in landing copy — if any
 * of these surfaces in the in-scope files outside comments, the test
 * fails. */
const HARD_BAN: string[] = [
  'delve',
  'delves',
  'delving',
  'leverage',
  'leverages',
  'leveraging',
  'empower',
  'empowers',
  'empowering',
  'showcase',
  'showcases',
  'showcasing',
  'underscore',
  'underscores',
  'underscoring',
  'intricate',
  'pivotal',
  'tapestry',
  'realm',
  'realms',
  'navigate the complexities',
  'in conclusion',
  'thrilled to announce',
  'just wanted to reach out',
  'cutting-edge',
  'seamless',
  'seamlessly',
  'unlock',
  'unlocks',
  'unlocking',
  'AI-powered',
];

/* Soft-warning banned words — these have legitimate technical /
 * structural use in the codebase, so the test does not fail on them.
 * It logs them to stdout so a future cleanup pass can pick them up.
 *   - robust: e.g. "robust against partial failure"
 *   - harness: test harness
 *   - transform: CSS transform property
 *   - engagement: comment about a "regeneration"-vs-"engagement" query
 *   - comprehensive: rare, may be used technically
 */
const SOFT_WARN: string[] = [
  'robust',
  'harness',
  'harnesses',
  'harnessing',
  'transform',
  'transforms',
  'transforming',
  'engagement',
  'comprehensive',
];

interface Hit {
  file: string;
  line: number;
  word: string;
  context: string;
}

/* Lines that should be skipped — comments, type-import paths, jsx
 * comment markers, etc. The heuristic: a line whose first
 * non-whitespace character is `*`, `//`, or `/*` is a comment. We
 * also skip lines containing `Banned words:` (the prompt instruction
 * inside the ask/summarise route deliberately enumerates the list). */
function isCommentLike(line: string): boolean {
  const trimmed = line.trimStart();
  if (trimmed.startsWith('//')) return true;
  if (trimmed.startsWith('*')) return true;
  if (trimmed.startsWith('/*')) return true;
  if (trimmed.startsWith('{/*')) return true;
  if (trimmed.startsWith('//')) return true;
  if (trimmed.includes('Banned words:')) return true;
  return false;
}

/* Detect a transform that is the CSS property, not the verb. The CSS
 * usage is always followed by `:` or `(` or `=` (or wrapped in
 * `transform=`). The verb usage shows up as `transform ` followed by
 * a noun. */
function isCssTransformContext(word: string, line: string, idx: number): boolean {
  if (word !== 'transform' && word !== 'transforms' && word !== 'transforming') {
    return false;
  }
  const after = line.slice(idx + word.length);
  if (after.startsWith('=') || after.startsWith(':') || after.startsWith('(')) return true;
  /* `text-transform`, `transform-origin`, etc. */
  const before = line.slice(0, idx);
  if (before.endsWith('-')) return true;
  if (before.endsWith('text-')) return true;
  return false;
}

async function* walk(dir: string): AsyncGenerator<string> {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  for (const e of entries) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) {
      yield* walk(full);
    } else if (e.isFile()) {
      yield full;
    }
  }
}

async function gatherFiles(dirs: string[]): Promise<string[]> {
  const out: string[] = [];
  for (const d of dirs) {
    const abs = path.resolve(REPO_ROOT, d);
    try {
      for await (const f of walk(abs)) {
        if (SKIP_FILE_PATTERNS.some((re) => re.test(f))) continue;
        if (!/\.(tsx?|mdx|md)$/.test(f)) continue;
        out.push(f);
      }
    } catch {
      /* dir may not exist yet (e.g. components/cost on a fresh
         checkout before this round). silently skip. */
    }
  }
  return out;
}

async function gatherInScopeFiles(): Promise<string[]> {
  const out: string[] = [];
  for (const f of SCOPE_FILES) {
    out.push(path.resolve(REPO_ROOT, f));
  }
  out.push(...(await gatherFiles(SCOPE_DIRS)));
  return out;
}

async function gatherDashScopeFiles(): Promise<string[]> {
  const out = await gatherInScopeFiles();
  out.push(...(await gatherFiles(DASH_ONLY_DIRS)));
  return out;
}

/**
 * The part of `line` that is NOT inside a comment.
 *
 * `state.inBlock` carries block-comment nesting across lines, which is
 * what the per-line `isCommentLike` heuristic above cannot do: a
 * continuation line whose first character is a letter still belongs to
 * the comment that opened two lines earlier.
 *
 * Deliberately naive about string literals: a `/*` or `//` inside a
 * quoted string ends the scan for that line. That direction of error
 * only ever hides a violation, never invents one, which is the right
 * bias for a lint that fails a build.
 */
function codeOutsideComments(line: string, state: { inBlock: boolean }): string {
  let out = '';
  let i = 0;
  while (i < line.length) {
    if (state.inBlock) {
      const end = line.indexOf('*/', i);
      if (end === -1) return out;
      state.inBlock = false;
      i = end + 2;
      continue;
    }
    const blockStart = line.indexOf('/*', i);
    /* `//` that is not the `//` of a URL scheme (`https://`). */
    let lineStart = -1;
    for (let j = i; j < line.length - 1; j++) {
      if (line[j] === '/' && line[j + 1] === '/' && line[j - 1] !== ':') {
        lineStart = j;
        break;
      }
    }
    if (blockStart === -1 && lineStart === -1) {
      out += line.slice(i);
      return out;
    }
    if (lineStart !== -1 && (blockStart === -1 || lineStart < blockStart)) {
      out += line.slice(i, lineStart);
      return out;
    }
    out += line.slice(i, blockStart);
    state.inBlock = true;
    i = blockStart + 2;
  }
  return out;
}

function findDashHits(file: string, body: string): Hit[] {
  const hits: Hit[] = [];
  /* Markdown has no code comments; scan it verbatim. */
  const isMarkdown = /\.mdx?$/.test(file);
  const state = { inBlock: false };
  const lines = body.split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const code = isMarkdown ? line : codeOutsideComments(line, state);
    for (const d of BANNED_DASHES) {
      if (!code.includes(d.char)) continue;
      hits.push({
        file: path.relative(REPO_ROOT, file),
        line: i + 1,
        word: d.name,
        context: line.trim().slice(0, 160),
      });
    }
  }
  return hits;
}

function findHits(file: string, body: string, words: string[]): Hit[] {
  const hits: Hit[] = [];
  const lines = body.split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (isCommentLike(line)) continue;
    for (const w of words) {
      /* Word-boundary match for single-word entries; substring match
         for multi-word phrases (regex \b would not span the space). */
      const isPhrase = /\s/.test(w);
      let idx = -1;
      if (isPhrase) {
        idx = line.toLowerCase().indexOf(w.toLowerCase());
      } else {
        const re = new RegExp(`\\b${w}\\b`, 'i');
        const m = line.match(re);
        if (m && m.index !== undefined) idx = m.index;
      }
      if (idx < 0) continue;
      if (isCssTransformContext(w.toLowerCase(), line, idx)) continue;
      hits.push({
        file: path.relative(REPO_ROOT, file),
        line: i + 1,
        word: w,
        context: line.trim().slice(0, 160),
      });
    }
  }
  return hits;
}

test('no hard-banned voice words in user-facing surfaces', async () => {
  const files = await gatherInScopeFiles();
  const allHits: Hit[] = [];
  for (const f of files) {
    let body = '';
    try {
      body = await fs.readFile(f, 'utf8');
    } catch {
      /* file may have been deleted between readdir and now; skip. */
      continue;
    }
    allHits.push(...findHits(f, body, HARD_BAN));
  }
  if (allHits.length > 0) {
    const lines = allHits.map(
      (h) => `  ${h.file}:${h.line}  word="${h.word}"  ${h.context}`,
    );
    assert.fail(
      `voice rule violation — banned words in user-facing copy:\n${lines.join('\n')}`,
    );
  }
});

test('no em-dash or its relatives in user-facing copy', async () => {
  const files = await gatherDashScopeFiles();
  const allHits: Hit[] = [];
  for (const f of files) {
    let body = '';
    try {
      body = await fs.readFile(f, 'utf8');
    } catch {
      continue;
    }
    allHits.push(...findDashHits(f, body));
  }
  if (allHits.length > 0) {
    const lines = allHits.map(
      (h) => `  ${h.file}:${h.line}  ${h.word}  ${h.context}`,
    );
    assert.fail(
      `voice rule violation - dash characters in user-facing copy `
        + `(use an ASCII hyphen, or a comma / colon / semicolon):\n${lines.join('\n')}`,
    );
  }
});

test('soft-warning words log to stdout but do not fail the build', async () => {
  const files = await gatherInScopeFiles();
  const allHits: Hit[] = [];
  for (const f of files) {
    let body = '';
    try {
      body = await fs.readFile(f, 'utf8');
    } catch {
      continue;
    }
    allHits.push(...findHits(f, body, SOFT_WARN));
  }
  /* Always passes — this is a soft warning surface. We log so a
     future cleanup pass has visibility. */
  if (allHits.length > 0) {
    const lines = allHits.map(
      (h) => `  ${h.file}:${h.line}  word="${h.word}"  ${h.context}`,
    );
    /* stderr because passing tests' stdout is suppressed by some
       runners. Voice-warnings are useful to surface always. */
    process.stderr.write(
      `voice soft-warning — words to consider rewriting:\n${lines.join('\n')}\n`,
    );
  }
  assert.ok(true);
});
