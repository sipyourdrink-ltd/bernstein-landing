/**
 * The two machine-surface documents, and the one regression this repo
 * actually cares about: advertising something that is not there.
 *
 * `/.well-known/api-catalog` (RFC 9727) and `/.well-known/skills.json`
 * both project from `lib/machine-surfaces.ts`. The tests below check
 * three things, in ascending order of how much they matter:
 *
 *   1. Shape. Content types, the RFC 9727 profile, the linkset key,
 *      the skills-entry fields.
 *   2. Agreement. Every endpoint in the skills index appears in the
 *      catalog, and both are drawn from the same list.
 *   3. Resolution. Every URL either document mentions - anchors, link
 *      hrefs, skill urls - resolves to a route handler, a page, or a
 *      file in public/. This is the one that stops a card describing
 *      tools that do not exist.
 *
 * Test 3 resolves against the filesystem rather than by fetching,
 * because the failure it guards against is a path being written down
 * that was never built, and that is visible in the repo without a
 * server. It understands the three ways this app serves a path:
 * `app/<path>/route.ts(x)`, `app/<path>/page.tsx`, and `public/<path>`.
 * It also understands the percent-encoded folder names Next needs for
 * segments starting with a character it reserves (`app/api/%5Fmarkdown`
 * serves `/api/_markdown`), so a future move of `.well-known` into an
 * encoded folder does not silently turn this test into a no-op.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

import { GET as catalogGET, RFC9727_PROFILE } from '../app/.well-known/api-catalog/route.ts';
import { GET as skillsGET } from '../app/.well-known/skills.json/route.ts';
import {
  MACHINE_ENDPOINTS,
  SITE_URL,
  agentCapabilities,
  allDeclaredPaths,
  servedEndpoints,
} from '../lib/machine-surfaces.ts';

const REPO = process.cwd();
const APP = path.join(REPO, 'app');
const PUBLIC = path.join(REPO, 'public');

const catalog = JSON.parse(await catalogGET().text()) as {
  linkset: Array<Record<string, unknown>>;
};
const skills = JSON.parse(await skillsGET().text()) as {
  skills: Array<Record<string, unknown>>;
};

/* ---------- path resolution ---------- */

const exists = (p: string): boolean => fs.existsSync(p);

/**
 * Candidate on-disk directories for one URL segment. Next serves a
 * segment either from a literally-named folder or from one whose name
 * is percent-encoded, which is how a segment starting with `_` or `.`
 * gets past the router's own conventions.
 */
function segmentCandidates(segment: string): string[] {
  const encoded = `%${segment.charCodeAt(0).toString(16).toUpperCase().padStart(2, '0')}${segment.slice(1)}`;
  return segment === encoded ? [segment] : [segment, encoded];
}

/** Every on-disk app/ directory a URL path could map to. */
function appDirCandidates(urlPath: string): string[] {
  const segments = urlPath.split('/').filter(Boolean);
  let dirs = [APP];
  for (const segment of segments) {
    const next: string[] = [];
    for (const dir of dirs) {
      for (const candidate of segmentCandidates(segment)) {
        next.push(path.join(dir, candidate));
      }
    }
    dirs = next;
  }
  return dirs;
}

/** How a URL path is served, or null when nothing serves it. */
function resolve(urlPath: string): string | null {
  /* Query strings and fragments are not part of the route. */
  const clean = urlPath.split(/[?#]/)[0]!;

  if (clean === '/' || clean === '') {
    return exists(path.join(APP, 'page.tsx')) ? 'app/page.tsx' : null;
  }

  const staticFile = path.join(PUBLIC, clean);
  if (exists(staticFile) && fs.statSync(staticFile).isFile()) {
    return `public${clean}`;
  }

  for (const dir of appDirCandidates(clean)) {
    for (const file of ['route.ts', 'route.tsx', 'page.tsx']) {
      if (exists(path.join(dir, file))) {
        return `${path.relative(REPO, path.join(dir, file))}`;
      }
    }
  }
  return null;
}

/** Every absolute bernstein.run URL mentioned anywhere in a document. */
function urlsIn(doc: unknown): string[] {
  const found = new Set<string>();
  const walk = (node: unknown): void => {
    if (typeof node === 'string') {
      if (node.startsWith(SITE_URL)) found.add(node);
      return;
    }
    if (Array.isArray(node)) {
      node.forEach(walk);
      return;
    }
    if (node && typeof node === 'object') {
      Object.values(node).forEach(walk);
    }
  };
  walk(doc);
  return [...found];
}

/* ---------- 1. shape ---------- */

test('/.well-known/api-catalog serves application/linkset+json with the RFC 9727 profile', () => {
  const res = catalogGET();
  assert.equal(res.status, 200);
  const ct = res.headers.get('content-type') ?? '';
  assert.match(ct, /^application\/linkset\+json/);
  assert.ok(
    ct.includes(`profile="${RFC9727_PROFILE}"`),
    `content-type must carry profile="${RFC9727_PROFILE}" - it is how a client tells ` +
      `an API catalog from any other linkset. Got: ${ct}`,
  );
  assert.equal(RFC9727_PROFILE, 'https://www.rfc-editor.org/info/rfc9727');
});

test('the catalog body is a linkset and nothing else', () => {
  assert.deepEqual(Object.keys(catalog), ['linkset']);
  assert.ok(Array.isArray(catalog.linkset) && catalog.linkset.length > 0);
  for (const member of catalog.linkset) {
    assert.equal(typeof member.anchor, 'string', 'every linkset member needs an anchor');
    const relations = Object.keys(member).filter((k) => k !== 'anchor');
    assert.ok(relations.length > 0, `member ${member.anchor} carries no links`);
    for (const rel of relations) {
      assert.ok(
        ['service-desc', 'service-doc', 'service-meta'].includes(rel),
        `unexpected relation "${rel}" - RFC 9727 uses the three RFC 8631 service relations`,
      );
      for (const l of member[rel] as Array<Record<string, unknown>>) {
        for (const field of ['href', 'type', 'title']) {
          assert.equal(typeof l[field], 'string', `link under ${rel} is missing ${field}`);
        }
      }
    }
  }
});

test('/.well-known/skills.json serves json with the documented entry shape', () => {
  const res = skillsGET();
  assert.equal(res.status, 200);
  assert.match(res.headers.get('content-type') ?? '', /^application\/json/);
  assert.ok(Array.isArray(skills.skills) && skills.skills.length > 0);
  for (const skill of skills.skills) {
    for (const field of ['name', 'description', 'method', 'url', 'input', 'output']) {
      assert.equal(typeof skill[field], 'string', `skill ${skill.name} is missing ${field}`);
    }
    assert.ok(['GET', 'POST'].includes(skill.method as string));
    assert.ok((skill.url as string).startsWith(SITE_URL));
  }
});

test('both documents are edge-cacheable like the other discovery surfaces', () => {
  for (const [name, res] of [['api-catalog', catalogGET()], ['skills.json', skillsGET()]] as const) {
    const cc = res.headers.get('cache-control') ?? '';
    assert.match(cc, /max-age=300/, `${name} cache-control`);
    assert.match(cc, /s-maxage=3600/, `${name} cache-control`);
  }
});

/* ---------- 2. agreement ---------- */

test('the skills index and the catalog cannot disagree about what is offered', () => {
  const anchors = new Set(catalog.linkset.map((m) => m.anchor as string));
  for (const skill of skills.skills) {
    assert.ok(
      anchors.has(skill.url as string),
      `${skill.url} is offered as a skill but has no member in the API catalog. Both ` +
        'documents project from lib/machine-surfaces.ts; a mismatch means one route ' +
        'stopped reading it.',
    );
  }
  assert.deepEqual(
    skills.skills.map((s) => s.name),
    agentCapabilities().map((e) => e.name),
    'skills.json must render exactly the endpoints flagged agentCapability in the ' +
      'shared module, in order',
  );
});

test('every endpoint in the shared list has a catalog member', () => {
  const anchors = new Set(catalog.linkset.map((m) => m.anchor as string));
  for (const endpoint of servedEndpoints()) {
    assert.ok(
      anchors.has(`${SITE_URL}${endpoint.path}`),
      `${endpoint.path} is served but absent from the catalog`,
    );
  }
});

test('the non-capability endpoint is catalogued but not offered as a skill', () => {
  /* /api/csp-report is the case the agentCapability flag exists for. If
     this stops being true the flag has become decoration. */
  const names = new Set(skills.skills.map((s) => s.name));
  const nonCapabilities = MACHINE_ENDPOINTS.filter((e) => !e.agentCapability);
  assert.ok(nonCapabilities.length > 0, 'no endpoint is flagged non-capability any more');
  for (const endpoint of nonCapabilities) {
    assert.ok(!names.has(endpoint.name), `${endpoint.name} must not appear in skills.json`);
  }
});

/* ---------- 3. resolution ---------- */

test('every path the shared module declares resolves to something in the repo', () => {
  const unresolved = allDeclaredPaths().filter((p) => resolve(p) === null);
  assert.deepEqual(
    unresolved,
    [],
    'lib/machine-surfaces.ts names a path with no route handler, no page, and no file ' +
      'in public/. Serving a discovery document that points at a 404 is the exact ' +
      'failure these surfaces exist to avoid.',
  );
});

test('every URL in the catalog resolves', () => {
  const unresolved = urlsIn(catalog)
    .map((u) => u.slice(SITE_URL.length) || '/')
    .filter((p) => resolve(p) === null);
  assert.deepEqual(unresolved, [], 'the API catalog advertises URLs that nothing serves');
});

test('every URL in the skills index resolves', () => {
  const unresolved = urlsIn(skills)
    .map((u) => u.slice(SITE_URL.length) || '/')
    .filter((p) => resolve(p) === null);
  assert.deepEqual(unresolved, [], 'the skills index advertises URLs that nothing serves');
});

test('the resolver is not vacuously passing', () => {
  /* A resolver that returns a truthy value for everything would make
     the three tests above meaningless. Pin both directions. */
  assert.equal(resolve('/openapi.yaml'), 'public/openapi.yaml');
  assert.equal(resolve('/api/health'), path.join('app', 'api', 'health', 'route.ts'));
  assert.equal(resolve('/api/og'), path.join('app', 'api', 'og', 'route.tsx'));
  assert.equal(resolve('/why-bernstein'), path.join('app', 'why-bernstein', 'page.tsx'));
  assert.equal(resolve('/api/_markdown'), path.join('app', 'api', '%5Fmarkdown', 'route.ts'));
  assert.equal(resolve('/no-such-surface'), null);
  assert.equal(resolve('/api/nope'), null);
});
