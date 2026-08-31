/**
 * The markdown view of a page: what `/api/_markdown` serves once
 * middleware has decided a request asked for markdown.
 *
 * This is the Node half of the feature. `lib/markdown-negotiation.ts`
 * is the edge half - it decides *whether* to rewrite and *what to* -
 * and stays free of `node:` imports because middleware runs in the edge
 * runtime. Reading MDX off disk happens here.
 *
 * The logic lives in a lib rather than in the route file for the reason
 * `tests/signals-route.test.ts` documents: the route folder is
 * `%5Fmarkdown` on disk so Next serves `/api/_markdown` (a leading
 * underscore marks a folder private), and Node's ESM resolver decodes
 * `%5F` back to `_`, so a test cannot import the route file by its
 * on-disk path. The route is a wrapper; this is what it wraps.
 *
 * Caching, which is the part that can hurt real users. This site rides
 * a CDN, and CDNs generally ignore `Vary` for everything except
 * Accept-Encoding - so `Vary: Accept` alone would not stop a cached
 * markdown body being replayed to the next browser that asks for the
 * same URL. The markdown responses are therefore `no-store`: they can
 * never enter a shared cache, whatever the edge does, and the HTML
 * responses keep the TTLs they have today.
 *
 * The cost of that choice is the mirror-image case: a client asking for
 * markdown may be handed an edge-cached HTML page, because the edge
 * cannot tell the two requests apart either. That is a degraded
 * response, not a corrupted one, and it is the safe direction to fail
 * in. Making the markdown path reliable rather than merely safe needs
 * an edge rule that bypasses the cache when Accept names markdown; that
 * belongs in the CDN config, not here.
 */
import fs from 'node:fs/promises';
import path from 'node:path';

import { markdownTargetFor } from './markdown-negotiation.ts';

const BLOG_DIR = path.resolve(process.cwd(), 'content', 'blog');

/**
 * Headers every response from the markdown view carries.
 *
 * No X-Robots-Tag. The negotiated response is served at the page's own
 * URL, so it is the same resource to a crawler and should carry the
 * same indexing directive - which the broad matcher in next.config.mjs
 * already applies, and which wins over anything set here because those
 * entries match the incoming path. Setting a different value here would
 * only look like it worked.
 *
 * The Cache-Control below is likewise reinforced in next.config.mjs for
 * the two negotiable paths; on its own it would be overwritten by the
 * page's edge TTL. It is set here as well so a direct hit on
 * /api/_markdown, which those entries do not match, is also no-store.
 */
export const MARKDOWN_HEADERS: Readonly<Record<string, string>> = {
  'Content-Type': 'text/markdown; charset=utf-8',
  'Cache-Control': 'no-store',
  Vary: 'Accept',
};

function markdown(body: string, status = 200): Response {
  return new Response(body, { status, headers: { ...MARKDOWN_HEADERS } });
}

/**
 * Is this post published?
 *
 * Reads the frontmatter block only - it is all the decision needs and
 * the body can be long. A file whose frontmatter cannot be read is
 * treated as a draft: when we cannot tell, the safe default is not to
 * publish.
 */
export function isPublished(source: string): boolean {
  const match = /^---\r?\n([\s\S]*?)\r?\n---/.exec(source);
  if (!match) return false;
  return !/^draft:\s*true\s*$/m.test(match[1]!);
}

async function blogPostMarkdown(slug: string): Promise<Response> {
  /* `slug` has already passed the kebab-case pattern in
     markdownTargetFor. Resolving and then re-checking containment is
     the belt to that braces: whatever the pattern lets through, the
     resolved path still has to sit directly under content/blog. */
  const file = path.resolve(BLOG_DIR, slug, 'index.mdx');
  if (path.dirname(path.dirname(file)) !== BLOG_DIR) return markdown('# Not found\n', 404);

  let source: string;
  try {
    source = await fs.readFile(file, 'utf8');
  } catch {
    /* No such post. The HTML view 404s for this slug too - the blog
       routes are generated from these very files - so the client gets
       the same answer either way, in the type it asked for. */
    return markdown('# Not found\n', 404);
  }

  /* getAllPosts filters `draft: true` out of the site, so an
     unpublished post's HTML 404s while its MDX sits on disk. Serving it
     here would publish, through the markdown view, exactly what the
     HTML view hides. */
  if (!isPublished(source)) return markdown('# Not found\n', 404);

  return markdown(source);
}

export type SiteIndexBuilder = () => Promise<string>;

/**
 * The site index as markdown is llms.txt, which is already the
 * hand-written summary of this site for a machine reader. Imported at
 * call time because `lib/seo` pulls in the MDX pipeline and the blog
 * components with it, which this module has no other use for.
 */
const defaultSiteIndex: SiteIndexBuilder = async () => {
  const { buildLlmsTxt } = await import('./seo.ts');
  return buildLlmsTxt();
};

/**
 * Serve the markdown view of `requestedPath`, or 404 when it has none.
 *
 * `buildSiteIndex` is injectable so the site-index branch can be
 * exercised without loading the MDX pipeline, which the strip-types
 * test harness cannot parse.
 */
export async function serveMarkdown(
  requestedPath: string,
  buildSiteIndex: SiteIndexBuilder = defaultSiteIndex,
): Promise<Response> {
  const target = markdownTargetFor(requestedPath);

  /* Only middleware sends traffic here, and only for paths that have a
     markdown view. A direct hit with anything else gets a plain 404
     rather than a hint about what this route is for. */
  if (!target) return markdown('# Not found\n', 404);

  return target.kind === 'site-index'
    ? markdown(await buildSiteIndex())
    : await blogPostMarkdown(target.slug);
}
