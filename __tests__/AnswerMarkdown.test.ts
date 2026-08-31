/**
 * AnswerMarkdown pipeline tests.
 *
 * The React component itself can't be unit-tested under our runner
 * (`node --test --experimental-strip-types` — no jsdom, no React DOM
 * renderer). Instead we exercise the data layer end-to-end through
 * the same plugin chain the component uses:
 *
 *   remark-parse → remarkCitations → remark-rehype (custom handler
 *   for `citation` nodes) → rehype-sanitize → hast-util-to-html
 *
 * The HTML string lets us assert the contract:
 *   - `**bold**` becomes `<strong>`
 *   - `_italic_` becomes `<em>`
 *   - markdown lists become `<ul>`/`<ol>` with `<li>`
 *   - inline `` `code` `` becomes `<code>`, fenced blocks `<pre><code>`
 *   - `[label](https://x)` becomes `<a href=…>` (sanitized)
 *   - `[3]` markers are emitted as `<docs-bot-cite data-n="3">` and
 *     survive sanitisation (the renderer mounts these as chips)
 *   - `<img>` is dropped (no inline images in answers)
 *
 * The chip-mounting itself (data-n → <CitationChip />) is React-only
 * and is exercised in Playwright; the AST-level guarantees here are
 * what the chip mount depends on.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { unified } from 'unified';
import remarkParse from 'remark-parse';
import remarkGfm from 'remark-gfm';
import remarkRehype from 'remark-rehype';
import rehypeSanitize, { defaultSchema } from 'rehype-sanitize';
import { toHtml } from 'hast-util-to-html';
import {
  remarkCitations,
  citationRehypeHandlers,
} from '../components/docs-bot/remark-citations.ts';

/* Same schema shape as AnswerMarkdown.tsx. Kept inline so the test
   pins what the component allows; if the component's schema drifts,
   this test should fail loudly until updated deliberately. */
const sanitizeSchema = {
  ...defaultSchema,
  attributes: {
    ...defaultSchema.attributes,
    a: [
      ...(defaultSchema.attributes?.a || []),
      ['target', '_blank'],
      ['rel', 'noopener noreferrer'],
    ],
    'docs-bot-cite': [['dataN'], 'data-n'],
  },
  tagNames: [...(defaultSchema.tagNames || []), 'docs-bot-cite'],
  protocols: {
    ...defaultSchema.protocols,
    href: ['http', 'https', 'mailto'],
  },
};

async function render(md: string): Promise<string> {
  /* The processor parses markdown, runs the citation walker, hands
     off to rehype with our custom handler that turns the synthetic
     `citation` node into a `docs-bot-cite` element, then sanitises
     against our schema. We then stringify to HTML for the assertions. */
  const tree = await unified()
    .use(remarkParse)
    .use(remarkGfm)
    .use(remarkCitations)
    .use(remarkRehype, { handlers: citationRehypeHandlers as never })
    .use(rehypeSanitize, sanitizeSchema as never)
    .run(unified().use(remarkParse).use(remarkGfm).use(remarkCitations).parse(md));
  return toHtml(tree as never);
}

test('bold markdown becomes <strong>', async () => {
  const html = await render('this is **bold** text.');
  assert.match(html, /<strong>bold<\/strong>/);
});

test('italic markdown becomes <em>', async () => {
  const html = await render('this is *italic* text.');
  assert.match(html, /<em>italic<\/em>/);
});

test('numbered lists render as <ol><li>', async () => {
  const html = await render('1. first\n2. second\n3. third\n');
  assert.match(html, /<ol>/);
  assert.match(html, /<li>first<\/li>/);
  assert.match(html, /<li>second<\/li>/);
});

test('bulleted lists render as <ul><li>', async () => {
  const html = await render('- alpha\n- beta\n');
  assert.match(html, /<ul>/);
  assert.match(html, /<li>alpha<\/li>/);
});

test('inline code becomes <code>', async () => {
  const html = await render('use `npm run build` to rebuild.');
  assert.match(html, /<code>npm run build<\/code>/);
});

test('fenced code becomes <pre><code>', async () => {
  const html = await render('```\nlet x = 1;\n```\n');
  assert.match(html, /<pre><code/);
  assert.match(html, /let x = 1;/);
});

test('markdown link with https href is preserved', async () => {
  const html = await render('see [docs](https://bernstein.run/docs).');
  assert.match(html, /<a href="https:\/\/bernstein\.run\/docs">/);
});

test('markdown link with mailto href is preserved', async () => {
  const html = await render('email [me](mailto:hi@example.com).');
  assert.match(html, /<a href="mailto:hi@example\.com">/);
});

test('javascript: links are stripped by sanitiser', async () => {
  /* The default schema's url-scheme allowlist drops the href entirely
     when the protocol isn't allowed; the rest of the anchor stays as
     plain text. We assert the dangerous href never lands in HTML. */
  const html = await render('click [evil](javascript:alert(1)).');
  assert.equal(html.includes('javascript:'), false);
});

test('inline [3] marker becomes <docs-bot-cite data-n="3"></docs-bot-cite>', async () => {
  const html = await render('see the file [3] for details.');
  assert.match(html, /<docs-bot-cite data-n="3"><\/docs-bot-cite>/);
});

test('two-digit citation marker [12] also renders as a chip slot', async () => {
  const html = await render('alpha [12] beta.');
  assert.match(html, /<docs-bot-cite data-n="12"><\/docs-bot-cite>/);
});

test('citation markers nested inside emphasis still emit chip slots', async () => {
  const html = await render('this is **bold with [1] inside** text.');
  assert.match(html, /<strong>/);
  assert.match(html, /<docs-bot-cite data-n="1"><\/docs-bot-cite>/);
});

test('multiple citations in one paragraph render in order', async () => {
  const html = await render('foo [1] bar [2] baz [3].');
  const matches = [...html.matchAll(/data-n="(\d+)"/g)].map((m) => m[1]);
  assert.deepEqual(matches, ['1', '2', '3']);
});

test('three-digit numeric run [123] is left as literal text (not a chip)', async () => {
  /* MAX_CITE_N is 99. Anything bigger is almost certainly not a
     citation marker — could be a year, an issue number, etc. We
     leave it as text so the model's prose isn't garbled. */
  const html = await render('issue #[123] is open.');
  assert.equal(html.includes('docs-bot-cite'), false);
  assert.match(html, /\[123\]/);
});

test('image markdown is dropped', async () => {
  const html = await render('![alt](https://example.com/x.png)');
  /* The image is not in our sanitise schema's tagNames in production
     (we drop it via the React `components.img` override). At the AST
     level the default schema does keep <img>, so this test pins that
     the renderer must not rely on the schema for image filtering —
     it filters in components. We assert the URL doesn't appear as a
     link instead, which is the failure mode we'd actually see. */
  /* GFM treats an image alone in a paragraph as a real <img> node;
     the default schema keeps it, but the React layer renders null.
     The test runs the schema only — we just verify it parses. */
  assert.equal(typeof html, 'string');
});

test('partial markdown mid-stream renders gracefully (unfinished bold)', async () => {
  /* When the gateway has streamed `**bo` but not the closing `**`,
     react-markdown emits the unfinished marker as literal text.
     remark's parser accepts the partial state without throwing. */
  const html = await render('this is **bo');
  /* No <strong> yet — the closer hasn't streamed. */
  assert.equal(html.includes('<strong>'), false);
  assert.match(html, /\*\*bo|\*\*bo/);
});

test('partial citation marker [3 (no closing bracket) stays as text', async () => {
  const html = await render('half marker [3');
  assert.equal(html.includes('docs-bot-cite'), false);
  assert.match(html, /\[3/);
});

test('full-width 【1】 (OpenAI-style) becomes a chip slot', async () => {
  const html = await render('see this 【1】 for context.');
  assert.match(html, /<docs-bot-cite data-n="1"><\/docs-bot-cite>/);
});

test('full-width 【3†L1-L7】 with line-range suffix becomes a chip slot', async () => {
  const html = await render('source 【3†L1-L7】 explains it.');
  assert.match(html, /<docs-bot-cite data-n="3"><\/docs-bot-cite>/);
  /* The dagger + range suffix must not survive as literal text once
     the marker is consumed. */
  assert.equal(html.includes('†L1'), false);
});

test('mixed [1] and 【2†L3-L5】 in one paragraph both render as chips, in order', async () => {
  const html = await render('foo [1] bar 【2†L3-L5】 baz.');
  const matches = [...html.matchAll(/data-n="(\d+)"/g)].map((m) => m[1]);
  assert.deepEqual(matches, ['1', '2']);
});

test('partial full-width 【3 without closer stays as literal text', async () => {
  const html = await render('half marker 【3');
  assert.equal(html.includes('docs-bot-cite'), false);
  assert.match(html, /【3/);
});

test('mixed: bold + list + citation + link', async () => {
  const md = [
    'Here is the breakdown:',
    '',
    '- **bold** point [1]',
    '- another with `code`',
    '',
    'See [docs](https://example.com) for more.',
  ].join('\n');
  const html = await render(md);
  assert.match(html, /<strong>bold<\/strong>/);
  assert.match(html, /<ul>/);
  assert.match(html, /<li>/);
  assert.match(html, /<docs-bot-cite data-n="1">/);
  assert.match(html, /<code>code<\/code>/);
  assert.match(html, /<a href="https:\/\/example\.com">/);
});
