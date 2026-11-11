/**
 * The one custom analytics event the site sends: a click on a link that
 * leaves for another host. The only property is the destination host
 * name - no path, no query, no visitor identifier.
 */

export const OUTBOUND_CLICK_EVENT = 'outbound-click';

declare global {
  interface Window {
    umami?: {
      track: (event: string, data?: Record<string, string>) => void;
    };
  }
}

function bareHost(host: string): string {
  return host.toLowerCase().replace(/^www\./, '');
}

/**
 * Host name to record for a click on `href`, or null when the link
 * stays on `currentHost` or is not an http(s) link (mailto:, tel:,
 * fragment-only, unparsable).
 */
export function outboundDestination(href: string, currentHost: string): string | null {
  let url: URL;
  try {
    url = new URL(href, `https://${currentHost}`);
  } catch {
    return null;
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
  const host = bareHost(url.hostname);
  if (!host || host === bareHost(currentHost)) return null;
  return host;
}
