/**
 * Conversion event for install-command copy buttons.
 *
 * Matches the provisioned `install-snippet-copy` Goal and
 * `Landing to install copy` Funnel in Umami (`UMAMI_BEHAVIOR.md`).
 * Records only which fixed command slot was copied - never clipboard
 * contents or user input.
 */

export const INSTALL_COPY_EVENT = 'install-snippet-copy';

export const INSTALL_COPY_METHODS = ['pipx', 'brew', 'uv', 'docker', 'init'] as const;

export type InstallCopyMethod = (typeof INSTALL_COPY_METHODS)[number];

const ALLOWED_METHODS: ReadonlySet<string> = new Set(INSTALL_COPY_METHODS);

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
