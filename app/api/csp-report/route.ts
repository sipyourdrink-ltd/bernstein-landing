/**
 * POST /api/csp-report - collector for Content-Security-Policy violations.
 *
 * The CSP in `next.config.mjs` now carries `report-uri /api/csp-report`
 * and `report-to csp-endpoint`; this route is the sink both directives
 * point at. Before it existed the policy declared source lists and
 * nothing else, so a blocked resource - or a regression in one of the
 * source lists - produced no signal anywhere. The point of this route
 * is that a violation becomes a line in the container log an operator
 * can grep, nothing more.
 *
 * Two wire formats arrive here and both are normalised to one shape:
 *
 *   1. `report-uri`, Content-Type `application/csp-report`. A single
 *      object under a `csp-report` key with kebab-case fields. Legacy,
 *      but the only mechanism Firefox and Safari implement.
 *   2. `report-to` / Reporting API, Content-Type
 *      `application/reports+json`. An ARRAY of envelopes, each with a
 *      `type` and a camelCase `body`. Chrome takes this path and
 *      batches, so one POST can carry several violations.
 *
 * Hardening, in order of how much it matters:
 *
 *   - The endpoint is unauthenticated by construction (browsers send
 *     these without credentials), so everything below assumes the body
 *     is hostile. It is parsed, sampled into fixed fields, and never
 *     echoed back.
 *   - Per-IP rate limit. A single page load can emit a burst of
 *     violations and a script can emit an unbounded one; the cap keeps
 *     either from filling the disk. Denied requests are dropped
 *     silently rather than answered with 429 - a browser will not act
 *     on the status and telling a flooder it hit a limit is free
 *     information.
 *   - Body size cap, enforced on Content-Length and again while
 *     reading, because Content-Length is attacker-controlled.
 *   - Only the fields listed in `summarise` are logged, each truncated.
 *     `sample` in particular is a slice of page source chosen by the
 *     page, so it is length-capped and only ever emitted inside
 *     JSON.stringify, which escapes newlines - a report cannot forge a
 *     second log line.
 *
 * The response is always 204 with no body. There is no useful failure
 * mode to report to a browser's reporting agent, and a uniform reply
 * means a prober learns nothing from the status code.
 */
import { makeRateLimiter } from '../../../lib/rate-limit.ts';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Largest body we will read, in bytes. Real reports are ~1 KB. */
const MAX_BODY_BYTES = 32 * 1024;

/** Longest value we keep for any single logged field. */
const MAX_FIELD_CHARS = 300;

/** Most violation reports logged per IP per window. */
const REPORTS_PER_WINDOW = 60;
const WINDOW_MS = 10 * 60 * 1000;

/* Route-local limiter: CSP report volume must never eat into the
   assistant's budget, and vice versa. */
const reportRateLimiter = makeRateLimiter({
  limit: REPORTS_PER_WINDOW,
  windowMs: WINDOW_MS,
});

const ACCEPTED_TYPES = [
  'application/csp-report',
  'application/reports+json',
  'application/json',
];

const NO_CONTENT: ResponseInit = {
  status: 204,
  headers: { 'Cache-Control': 'no-store' },
};

/** Cloudflare stamps `cf-connecting-ip` on every edge hit. */
function clientIp(headers: Headers): string | null {
  const cf = headers.get('cf-connecting-ip');
  if (cf) return cf;
  const xff = headers.get('x-forwarded-for');
  return xff ? xff.split(',')[0]?.trim() ?? null : null;
}

function str(value: unknown): string | undefined {
  if (typeof value === 'string' && value.length > 0) {
    return value.slice(0, MAX_FIELD_CHARS);
  }
  if (typeof value === 'number') return String(value);
  return undefined;
}

interface ViolationSummary {
  directive?: string;
  blocked?: string;
  document?: string;
  disposition?: string;
  sourceFile?: string;
  line?: string;
  sample?: string;
}

/**
 * Flatten either wire format into the fields worth logging. Reads both
 * the kebab-case (`report-uri`) and camelCase (Reporting API) spellings
 * so callers do not have to know which arrived.
 */
function summarise(body: Record<string, unknown>): ViolationSummary {
  const pick = (...keys: string[]): string | undefined => {
    for (const key of keys) {
      const found = str(body[key]);
      if (found !== undefined) return found;
    }
    return undefined;
  };
  return {
    directive: pick('effectiveDirective', 'effective-directive', 'violatedDirective', 'violated-directive'),
    blocked: pick('blockedURL', 'blocked-uri'),
    document: pick('documentURL', 'document-uri'),
    disposition: pick('disposition'),
    sourceFile: pick('sourceFile', 'source-file'),
    line: pick('lineNumber', 'line-number'),
    sample: pick('sample', 'script-sample'),
  };
}

/**
 * Pull every CSP violation body out of a parsed payload, whichever of
 * the two formats it is. Returns an empty list for anything else -
 * a Reporting API POST can carry deprecation or intervention reports
 * that are not our business.
 */
function extractViolations(parsed: unknown): Record<string, unknown>[] {
  if (Array.isArray(parsed)) {
    const out: Record<string, unknown>[] = [];
    for (const entry of parsed) {
      if (!entry || typeof entry !== 'object') continue;
      const envelope = entry as Record<string, unknown>;
      if (envelope.type !== 'csp-violation') continue;
      if (envelope.body && typeof envelope.body === 'object') {
        out.push(envelope.body as Record<string, unknown>);
      }
    }
    return out;
  }
  if (parsed && typeof parsed === 'object') {
    const legacy = (parsed as Record<string, unknown>)['csp-report'];
    if (legacy && typeof legacy === 'object') {
      return [legacy as Record<string, unknown>];
    }
  }
  return [];
}

export async function POST(request: Request): Promise<Response> {
  if (!reportRateLimiter.check(clientIp(request.headers)).allowed) {
    return new Response(null, NO_CONTENT);
  }

  const contentType = (request.headers.get('content-type') ?? '').split(';')[0]!.trim().toLowerCase();
  if (!ACCEPTED_TYPES.includes(contentType)) {
    return new Response(null, NO_CONTENT);
  }

  const declaredLength = Number.parseInt(request.headers.get('content-length') ?? '', 10);
  if (Number.isFinite(declaredLength) && declaredLength > MAX_BODY_BYTES) {
    return new Response(null, NO_CONTENT);
  }

  let raw: string;
  try {
    raw = await request.text();
  } catch {
    return new Response(null, NO_CONTENT);
  }
  /* Content-Length is a claim, not a measurement. Check the real size. */
  if (raw.length > MAX_BODY_BYTES) {
    return new Response(null, NO_CONTENT);
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return new Response(null, NO_CONTENT);
  }

  for (const violation of extractViolations(parsed)) {
    console.warn('[csp-report]', JSON.stringify(summarise(violation)));
  }

  return new Response(null, NO_CONTENT);
}

/**
 * Defensive 405 for non-POST - same shape as the other internal routes,
 * so an operator tailing the log sees one pattern.
 */
export async function GET(): Promise<Response> {
  return new Response('use POST', { status: 405, headers: { Allow: 'POST' } });
}
