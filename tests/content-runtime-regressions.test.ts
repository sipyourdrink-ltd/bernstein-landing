import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

function loadModule(file: string, react: Record<string, unknown> = {}, extra = '', globals = {}) {
  const source = readFileSync(file, 'utf8') + extra;
  const code = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.React, esModuleInterop: true },
  }).outputText;
  const exports: Record<string, any> = {};
  vm.runInNewContext(code, {
    exports, module: { exports }, React: react, Error, Date, AbortController,
    require: (name: string) => {
      assert.equal(name, 'react');
      return react;
    },
    ...globals,
  }, { filename: file });
  return exports;
}

test('SSE citations retain section anchors for regular and preview frames', () => {
  const { normalizeEvent } = loadModule('components/docs-bot/useSseStream.ts', {}, '\nexport { normalizeEvent };');
  for (const name of ['citation', 'preview-citation']) {
    for (const fields of [{ chunk_id: 'setup', section: 'Setup' }, { chunkId: 'setup', section: 'Setup' }]) {
      const event = normalizeEvent(name, { citation: { n: 1, url: '/q/setup', ...fields } });
      assert.equal(event.chunkId, 'setup');
      assert.equal(event.section, 'Setup');
    }
    const malformed = normalizeEvent(name, { citation: { chunk_id: 7, section: false } });
    assert.equal(malformed.chunkId, undefined);
    assert.equal(malformed.section, undefined);
  }
});

test('SSE completion preserves follow-up questions and filters malformed values', () => {
  const { normalizeEvent } = loadModule('components/docs-bot/useSseStream.ts', {}, '\nexport { normalizeEvent };');
  for (const field of ['follow_ups', 'followUps']) {
    const event = normalizeEvent('done', { [field]: ['Next question?', 7, null], elapsed_ms: 15 });
    assert.deepEqual(Array.from(event.followUps ?? []), ['Next question?']);
    assert.equal(event.elapsedMs, 15);
  }
  assert.equal(normalizeEvent('done', {}).followUps, undefined);
});

function summaryHarness() {
  const states: any[] = [];
  let timeout: (() => void) | undefined;
  const react = {
    createContext: () => ({ Provider: 'provider' }),
    createElement: (type: unknown, props: unknown) => ({ type, props }),
    useState: (initial: unknown) => {
      const index = states.length;
      states.push(initial);
      return [initial, (next: any) => { states[index] = typeof next === 'function' ? next(states[index]) : next; }];
    },
    useRef: (current: unknown) => ({ current }),
    useCallback: (fn: unknown) => fn,
    useMemo: (fn: () => unknown) => fn(),
  };
  const { ArticleCompressionRoot } = loadModule('components/blog/ArticleCompression.tsx', react, '', {
    window: { setTimeout: (fn: () => void) => { timeout = fn; return 1; }, clearTimeout: () => {} },
    fetch: (_url: string, options: { signal: AbortSignal }) => new Promise((_resolve, reject) => {
      options.signal.addEventListener('abort', () => {
        const error = new Error('aborted');
        error.name = 'AbortError';
        reject(error);
      });
    }),
  });
  const element = ArticleCompressionRoot({ slug: 'example', children: null });
  return { states, api: element.props.value, expire: () => { assert.ok(timeout); timeout(); } };
}

test('summary timeout ends loading with a visible retry message', async () => {
  const harness = summaryHarness();
  harness.api.openCompressed('quick');
  harness.expire();
  await new Promise(setImmediate);
  assert.equal(harness.states[2], null);
  assert.equal(harness.states[3], 'the summary took too long; try again in a moment');
  assert.equal(harness.states[4], 'quick');
});

test('restoring the original article cancels a summary without an error', async () => {
  const harness = summaryHarness();
  harness.api.openCompressed('quick');
  harness.api.restoreOriginal();
  await new Promise(setImmediate);
  assert.equal(harness.states[0], 'original');
  assert.equal(harness.states[2], null);
  assert.equal(harness.states[3], null);
  assert.equal(harness.states[4], null);
});

test('article links distinguish HTTP schemes from local paths', () => {
  const react = { createElement: (_type: unknown, props: any) => props };
  const { SmartLink } = loadModule('components/blog/SmartLink.tsx', react);
  assert.equal(SmartLink({ href: 'HTTPS://example.com' }).target, '_blank');
  assert.equal(SmartLink({ href: 'http://example.com' }).rel, 'noopener noreferrer');
  assert.equal(SmartLink({ href: 'httpish/path' }).target, undefined);
  assert.equal(SmartLink({ href: '/blog/example' }).target, undefined);
});

test('blog cards retain the publication date west of UTC', () => {
  const previous = process.env.TZ;
  process.env.TZ = 'America/Los_Angeles';
  try {
    const { formatDate } = loadModule('components/blog/BlogCard.tsx', {}, '\nexport { formatDate };');
    assert.equal(formatDate('2026-03-29'), 'Mar 29, 2026');
  } finally {
    if (previous === undefined) delete process.env.TZ;
    else process.env.TZ = previous;
  }
});

test('CLI extraction keeps wrapped help, option types and defaults', () => {
  const source = readFileSync('scripts/extract-cli.mjs', 'utf8');
  const parser = source.slice(source.indexOf('function parseClickHelp('), source.indexOf('\nfunction stripAnsi('));
  const parse = new Function(`${parser}; return parseClickHelp;`)();
  const result = parse(`Usage: bernstein pr [OPTIONS]

Options:
  --issue N|URL                   Import a GitHub issue.
                                  --dry-run makes that one request.
  --very-long-option-name TEXT
                                  Wrapped help. [default: saved]
  --enabled / --disabled          Toggle. [default: enabled]
  --help                          Show this message and exit.
`);
  assert.equal(result.flags.filter((flag: any) => flag.primary === '--dry-run').length, 0);
  const issue = result.flags.find((flag: any) => flag.primary === '--issue');
  assert.equal(issue.type, 'N|URL');
  assert.match(issue.help, /--dry-run makes that one request/);
  const wrapped = result.flags.find((flag: any) => flag.primary === '--very-long-option-name');
  assert.equal(wrapped.default, 'saved');
  const toggle = result.flags.find((flag: any) => flag.primary === '--enabled');
  assert.deepEqual(toggle.flags, ['--enabled', '--disabled']);
});
