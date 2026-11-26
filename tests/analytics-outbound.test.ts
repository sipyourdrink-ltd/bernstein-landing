/**
 * The outbound-click event and the analytics opt-out hook.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';

import { INSTALL_COPY_EVENT, installCopyMethod } from '../lib/analytics/events.ts';
import { OUTBOUND_CLICK_EVENT, outboundDestination } from '../lib/analytics/outbound.ts';
import {
  ALLOWED_URL_PARAMS,
  OPERATOR_EXCLUDE_INLINE_SCRIPT,
  UMAMI_BEFORE_SEND,
  UMAMI_DISABLED_KEY,
  UMAMI_STANDARD_DISABLED_KEY,
} from '../lib/analytics/disable.ts';

test('the event name is outbound-click', () => {
  assert.equal(OUTBOUND_CLICK_EVENT, 'outbound-click');
});

test('the install copy event matches the Umami goal name and maps only known slots', () => {
  assert.equal(INSTALL_COPY_EVENT, 'install-snippet-copy');

  const tabButton = (tabId: string) => ({
    getAttribute: (name: string) => (name === 'class' ? 'v2-install-copy' : null),
    closest: (selector: string) =>
      selector === '[id^="install-body-"]' ? { id: `install-body-${tabId}` } : null,
  });

  assert.equal(installCopyMethod(tabButton('pipx')), 'pipx');
  assert.equal(installCopyMethod(tabButton('brew')), 'brew');
  assert.equal(installCopyMethod(tabButton('uv')), 'uv');
  assert.equal(installCopyMethod(tabButton('docker')), 'docker');
  assert.equal(installCopyMethod(tabButton('forged')), null);

  const initButton = {
    getAttribute: (name: string) => (name === 'class' ? 'v2-install-copy' : null),
    closest: (selector: string) =>
      selector === '[aria-label="post-install init command"]' ? {} : null,
  };
  assert.equal(installCopyMethod(initButton), 'init');

  const docsBotCtaButton = {
    getAttribute: (name: string) =>
      name === 'class' ? 'docs-bot-cta-strip-item docs-bot-cta-strip-install' : null,
    closest: () => null,
  };
  assert.equal(installCopyMethod(docsBotCtaButton), 'pipx');

  const unrelatedButton = {
    getAttribute: (name: string) => (name === 'class' ? 'docs-bot-copy-md' : null),
    closest: () => null,
  };
  assert.equal(installCopyMethod(unrelatedButton), null);
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

interface HookEnv {
  disabled?: string | null;
  standardDisabled?: string | null;
  gpc?: boolean;
  navigatorDnt?: string | null;
  windowDnt?: string | null;
  storageThrows?: boolean;
}

function runOptOut(flagOrEnv: string | null | HookEnv): (type: string, payload: unknown) => unknown {
  const env: HookEnv =
    typeof flagOrEnv === 'object' && flagOrEnv !== null
      ? flagOrEnv
      : { disabled: flagOrEnv };
  const store = new Map<string, string>();
  if (env.disabled != null) store.set(UMAMI_DISABLED_KEY, env.disabled);
  if (env.standardDisabled != null) store.set(UMAMI_STANDARD_DISABLED_KEY, env.standardDisabled);
  const window: Record<string, unknown> = {
    localStorage: env.storageThrows
      ? {
          getItem: () => {
            throw new Error('SecurityError');
          },
        }
      : { getItem: (k: string) => store.get(k) ?? null },
    navigator: {
      ...(env.gpc !== undefined ? { globalPrivacyControl: env.gpc } : {}),
      ...(env.navigatorDnt != null ? { doNotTrack: env.navigatorDnt } : {}),
    },
    ...(env.windowDnt != null ? { doNotTrack: env.windowDnt } : {}),
  };
  window.location = { href: 'https://bernstein.run/' };
  vm.runInNewContext(OPERATOR_EXCLUDE_INLINE_SCRIPT, { window, URL });
  const hook = window[UMAMI_BEFORE_SEND];
  assert.equal(typeof hook, 'function');
  return hook as (type: string, payload: unknown) => unknown;
}

test('with any opt-out key or browser privacy signal set the hook drops every request', () => {
  for (const env of [
    { disabled: 'true' },
    { disabled: '1' },
    { standardDisabled: 'true' },
    { standardDisabled: '1' },
    { gpc: true },
    { gpc: true, storageThrows: true },
    { navigatorDnt: '1' },
    { windowDnt: '1' },
  ] satisfies HookEnv[]) {
    const hook = runOptOut(env);
    assert.equal(hook('event', { url: '/' }), null);
    assert.equal(hook('event', { name: 'outbound-click' }), null);
    assert.equal(hook('event', { name: 'install-snippet-copy' }), null);
  }
});

test('without opt-out flags or privacy signals the hook passes page views and events through', () => {
  const view = { url: 'https://bernstein.run/blog?utm_source=x', referrer: 'https://example.com/' };
  assert.equal(JSON.stringify(runOptOut(null)('event', view)), JSON.stringify(view));
  const click = {
    url: 'https://bernstein.run/',
    name: 'outbound-click',
    data: { destination: 'github.com' },
  };
  assert.equal(
    JSON.stringify(
      runOptOut({ disabled: 'false', standardDisabled: '0', gpc: false, navigatorDnt: '0' })(
        'event',
        click,
      ),
    ),
    JSON.stringify(click),
  );
});

test('strips every non-UTM query parameter and URL hash while preserving the 5 UTM keys', () => {
  assert.deepEqual(ALLOWED_URL_PARAMS, [
    'utm_source',
    'utm_medium',
    'utm_campaign',
    'utm_content',
    'utm_term',
  ]);
  const hook = runOptOut(null);
  const first = hook('event', { url: 'https://bernstein.run/', referrer: '' }) as { url: string };
  assert.equal(first.url, 'https://bernstein.run/');
  /* Stripped query params and hash jumps collapse to the same cleaned URL,
     so duplicate page views are dropped. */
  assert.equal(hook('event', { url: 'https://bernstein.run/?q=how+do+i', referrer: 'https://bernstein.run/' }), null);
  assert.equal(hook('event', { url: 'https://bernstein.run/?q=how+do+i+install&ask=1' }), null);
  assert.equal(hook('event', { url: 'https://bernstein.run/#ask' }), null);
  assert.equal(hook('event', { url: 'https://bernstein.run/?email=user%40example.com&token=sec&fbclid=123#how' }), null);

  const next = hook('event', {
    url: 'https://bernstein.run/blog?ask=secret&email=a%40b.co&gclid=99&utm_source=hn&utm_medium=referral&utm_campaign=launch&utm_content=top&utm_term=agents#section-2',
    referrer: 'https://bernstein.run/?q=how+do+i+install&recipient=deadbeef#ask',
  }) as { url: string; referrer: string };
  assert.equal(
    next.url,
    'https://bernstein.run/blog?utm_source=hn&utm_medium=referral&utm_campaign=launch&utm_content=top&utm_term=agents',
  );
  assert.equal(next.referrer, 'https://bernstein.run/');

  const click = hook('event', {
    url: 'https://bernstein.run/?q=x&token=secret#ask',
    name: 'outbound-click',
    data: { destination: 'github.com' },
  }) as { url: string };
  assert.equal(click.url, 'https://bernstein.run/');
});
