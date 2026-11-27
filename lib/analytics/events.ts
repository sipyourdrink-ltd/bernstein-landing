/**
 * Conversion and attribution events for bernstein.run.
 *
 *   1. `install-snippet-copy` (`{ method }`): matches the provisioned
 *      Goal and `Landing to install copy` Funnel in Umami
 *      (`UMAMI_BEHAVIOR.md`). Records only which fixed command slot was
 *      copied - never clipboard contents or user input.
 *   2. `ai-referral` (`{ source }`): cookie-free, storage-free arrival
 *      counter covering the 14 canonical AI assistant domains (Umami's
 *      built-in LLM_DOMAINS covers only 6). Records only the matched
 *      bare host name - never path, query text, or identifiers.
 */

export const INSTALL_COPY_EVENT = 'install-snippet-copy';

export const INSTALL_COPY_METHODS = ['pipx', 'brew', 'uv', 'docker', 'init'] as const;

export type InstallCopyMethod = (typeof INSTALL_COPY_METHODS)[number];

const ALLOWED_METHODS: ReadonlySet<string> = new Set(INSTALL_COPY_METHODS);

export const AI_REFERRAL_EVENT = 'ai-referral';

export const AI_REFERRER_HOSTS = [
  'claude.ai',
  'chatgpt.com',
  'perplexity.ai',
  'gemini.google.com',
  'copilot.microsoft.com',
  'meta.ai',
  'grok.com',
  'x.ai',
  'kagi.com',
  'phind.com',
  'you.com',
  'chat.mistral.ai',
  'chat.deepseek.com',
  'poe.com',
] as const;

export type AiReferrerHost = (typeof AI_REFERRER_HOSTS)[number];

const ALLOWED_AI_HOSTS: ReadonlySet<string> = new Set(AI_REFERRER_HOSTS);

export interface CopyTargetLike {
  getAttribute(name: string): string | null;
  closest(selector: string): { id?: string } | null;
}

function hasClassToken(el: CopyTargetLike, token: string): boolean {
  const raw = el.getAttribute('class');
  if (!raw) return false;
  return raw.split(/\s+/).includes(token);
}

/**
 * Resolve which fixed install slot `button` copies, or null for any
 * other button on the site.
 */
export function installCopyMethod(button: CopyTargetLike): InstallCopyMethod | null {
  if (hasClassToken(button, 'docs-bot-cta-strip-install')) {
    return 'pipx';
  }
  if (!hasClassToken(button, 'v2-install-copy')) {
    return null;
  }
  const tabBody = button.closest('[id^="install-body-"]');
  if (tabBody?.id?.startsWith('install-body-')) {
    const slot = tabBody.id.slice('install-body-'.length);
    return ALLOWED_METHODS.has(slot) ? (slot as InstallCopyMethod) : null;
  }
  if (button.closest('[aria-label="post-install init command"]')) {
    return 'init';
  }
  return null;
}

function normalizeHostCandidate(raw: string): AiReferrerHost | null {
  const host = raw.trim().toLowerCase().replace(/^www\./, '');
  return ALLOWED_AI_HOSTS.has(host) ? (host as AiReferrerHost) : null;
}

/**
 * Match `document.referrer` or inbound `utm_source` against the closed
 * 14-host AI assistant allowlist. Requires an explicit `http:`/`https:`
 * scheme on `referrer` so scheme-less strings never resolve as URLs.
 */
export function aiReferralSource(referrer: string, locationSearch: string): AiReferrerHost | null {
  if (referrer && /^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(referrer)) {
    try {
      const parsed = new URL(referrer);
      if (parsed.protocol === 'https:' || parsed.protocol === 'http:') {
        const matched = normalizeHostCandidate(parsed.hostname);
        if (matched) return matched;
      }
    } catch {
      /* malformed referrer - fall through to utm_source check */
    }
  }
  if (locationSearch) {
    try {
      const utmSource = new URLSearchParams(locationSearch).get('utm_source');
      if (utmSource) {
        return normalizeHostCandidate(utmSource);
      }
    } catch {
      return null;
    }
  }
  return null;
}
