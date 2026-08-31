/**
 * Cross-property bridge-event helper tests.
 *
 * The React component layer (<OutboundLink>) can't be unit-tested under
 * this runner (``node --test --experimental-strip-types`` — no jsdom).
 * Instead we exercise the pure helpers (``canonicalDestination`` and
 * ``trackOutbound``) and stub ``window.umami`` + ``window.localStorage``
 * via ``globalThis``. The React render path is exercised in homepage's
 * vitest tests + the production smoke probe.
 */
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

interface TrackCall {
  name: string;
  data: Record<string, unknown> | undefined;
}

interface UmamiStub {
  track: (name: string, data?: Record<string, unknown>) => void;
  calls: TrackCall[];
}

interface LocalStorageStub {
  store: Map<string, string>;
  getItem: (key: string) => string | null;
  setItem: (key: string, value: string) => void;
  removeItem: (key: string) => void;
}

function makeUmami(): UmamiStub {
  const calls: TrackCall[] = [];
  return {
    calls,
    track(name, data) {
      calls.push({ name, data });
    },
  };
}

function makeLocalStorage(): LocalStorageStub {
  const store = new Map<string, string>();
  return {
    store,
    getItem: (k) => store.get(k) ?? null,
    setItem: (k, v) => {
      store.set(k, v);
    },
    removeItem: (k) => {
      store.delete(k);
    },
  };
}

/* Stub the browser globals the helper consults. Done at module load
   so the dynamic import below picks up window.* on first read. */
const umami = makeUmami();
const storage = makeLocalStorage();
const win = {
  umami,
  localStorage: storage,
} as unknown as Window & typeof globalThis;
(globalThis as unknown as { window: typeof win }).window = win;

const mod = await import('../components/site/track-outbound.ts');
const { canonicalDestination, trackOutbound, CANONICAL_HOSTNAMES } = mod;

beforeEach(() => {
  umami.calls.length = 0;
  storage.store.clear();
});

test('canonicalDestination folds www. into the bare canonical hostname', () => {
  assert.equal(canonicalDestination('https://www.bernstein.run/foo'), 'bernstein.run');
  assert.equal(canonicalDestination('https://www.alexchernysh.com/blog/x'), 'alexchernysh.com');
});

test('canonicalDestination lowercases the canonical hostname', () => {
  assert.equal(canonicalDestination('https://AlexChernysh.com/'), 'alexchernysh.com');
});

test('canonicalDestination returns null for non-canonical hosts', () => {
  assert.equal(canonicalDestination('https://example.com/foo'), null);
  assert.equal(canonicalDestination('https://producthunt.com/p/bernstein'), null);
});

test('canonicalDestination returns null for malformed input', () => {
  assert.equal(canonicalDestination(''), null);
  assert.equal(canonicalDestination(null), null);
  assert.equal(canonicalDestination(undefined), null);
});

test('CANONICAL_HOSTNAMES lists every owned canonical hostname', () => {
  assert.ok(CANONICAL_HOSTNAMES.includes('alexchernysh.com'));
  assert.ok(CANONICAL_HOSTNAMES.includes('bernstein.run'));
  assert.ok(CANONICAL_HOSTNAMES.includes('getbernstein.com'));
  assert.ok(CANONICAL_HOSTNAMES.includes('github.com'));
  assert.ok(CANONICAL_HOSTNAMES.includes('pypi.org'));
});

test('trackOutbound emits outbound-click with canonical destination', () => {
  trackOutbound('https://www.alexchernysh.com/?utm_source=bernstein', 'site-footer', 'author-site');
  assert.equal(umami.calls.length, 1);
  assert.equal(umami.calls[0].name, 'outbound-click');
  assert.deepEqual(umami.calls[0].data, {
    destination: 'alexchernysh.com',
    surface: 'site-footer',
    slug: 'author-site',
  });
});

test('trackOutbound omits slug when not passed', () => {
  trackOutbound('https://github.com/chernistry', 'site-footer');
  assert.equal(umami.calls.length, 1);
  assert.deepEqual(umami.calls[0].data, {
    destination: 'github.com',
    surface: 'site-footer',
  });
});

test('trackOutbound accepts a bare canonical hostname', () => {
  trackOutbound('github.com', 'hero', 'star');
  assert.equal(umami.calls.length, 1);
  assert.deepEqual(umami.calls[0].data, {
    destination: 'github.com',
    surface: 'hero',
    slug: 'star',
  });
});

test('trackOutbound respects the operator kill-switch', () => {
  storage.setItem('umami:disabled', 'true');
  trackOutbound('https://alexchernysh.com', 'site-footer');
  assert.equal(umami.calls.length, 0);
});

test('trackOutbound is a no-op when window.umami is absent', () => {
  const stashed = win.umami;
  (win as unknown as { umami: undefined }).umami = undefined;
  try {
    trackOutbound('https://alexchernysh.com', 'site-footer');
  } finally {
    win.umami = stashed;
  }
  assert.equal(umami.calls.length, 0);
});
