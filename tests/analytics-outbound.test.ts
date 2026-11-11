/**
 * The outbound-click event and the analytics opt-out hook.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';

import { OUTBOUND_CLICK_EVENT, outboundDestination } from '../lib/analytics/outbound.ts';
import {
  OPERATOR_EXCLUDE_INLINE_SCRIPT,
  UMAMI_BEFORE_SEND,
  UMAMI_DISABLED_KEY,
} from '../lib/analytics/disable.ts';

test('the event name is outbound-click', () => {
  assert.equal(OUTBOUND_CLICK_EVENT, 'outbound-click');
});

test('a link to another host records the bare host name only', () => {
  assert.equal(
    outboundDestination('https://www.github.com/sipyourdrink-ltd/bernstein?utm_source=x#readme', 'bernstein.run'),
    'github.com',
  );
  assert.equal(outboundDestination('https://docs.bernstein.run/cli', 'bernstein.run'), 'docs.bernstein.run');
});

test('same-host, relative and non-http links record nothing', () => {
  assert.equal(outboundDestination('/blog', 'bernstein.run'), null);
  assert.equal(outboundDestination('#ask', 'bernstein.run'), null);
  assert.equal(outboundDestination('https://www.bernstein.run/privacy', 'bernstein.run'), null);
  assert.equal(outboundDestination('mailto:forte@bernstein.run', 'bernstein.run'), null);
  assert.equal(outboundDestination('javascript:void(0)', 'bernstein.run'), null);
});

function runOptOut(flag: string | null): (type: string, payload: unknown) => unknown {
  const store = new Map<string, string>();
  if (flag !== null) store.set(UMAMI_DISABLED_KEY, flag);
  const window: Record<string, unknown> = {
    localStorage: { getItem: (k: string) => store.get(k) ?? null },
  };
  window.location = { href: 'https://bernstein.run/' };
  vm.runInNewContext(OPERATOR_EXCLUDE_INLINE_SCRIPT, { window, URL });
  const hook = window[UMAMI_BEFORE_SEND];
  assert.equal(typeof hook, 'function');
  return hook as (type: string, payload: unknown) => unknown;
}

test('with the opt-out flag set the hook drops every request', () => {
  const hook = runOptOut('true');
  assert.equal(hook('event', { url: '/' }), null);
  assert.equal(hook('event', { name: 'outbound-click' }), null);
});

test('without the flag the hook passes page views and events through', () => {
  const view = { url: 'https://bernstein.run/blog?utm_source=x', referrer: 'https://example.com/' };
  assert.equal(JSON.stringify(runOptOut(null)('event', view)), JSON.stringify(view));
  const click = { url: 'https://bernstein.run/', name: 'outbound-click', data: { destination: 'github.com' } };
  assert.equal(JSON.stringify(runOptOut('false')('event', click)), JSON.stringify(click));
});

test('text typed into the docs assistant never reaches the page address', () => {
  const hook = runOptOut(null);
  const first = hook('event', { url: 'https://bernstein.run/', referrer: '' }) as { url: string };
  assert.equal(first.url, 'https://bernstein.run/');
  /* Each keystroke rewrites ?q= and the tracker reports a page view for
     it; after cleaning the address is unchanged, so the view is dropped. */
  assert.equal(hook('event', { url: 'https://bernstein.run/?q=how+do+i', referrer: 'https://bernstein.run/' }), null);
  assert.equal(hook('event', { url: 'https://bernstein.run/?q=how+do+i+install&ask=1' }), null);
  const next = hook('event', {
    url: 'https://bernstein.run/blog?ask=secret&utm_source=x',
    referrer: 'https://bernstein.run/?q=how+do+i+install',
  }) as { url: string; referrer: string };
  assert.equal(next.url, 'https://bernstein.run/blog?utm_source=x');
  assert.equal(next.referrer, 'https://bernstein.run/');
  const click = hook('event', { url: 'https://bernstein.run/?q=x', name: 'outbound-click', data: { destination: 'github.com' } }) as { url: string };
  assert.equal(click.url, 'https://bernstein.run/');
});
