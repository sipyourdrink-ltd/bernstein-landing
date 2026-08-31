/**
 * /api/_markdown - the markdown view middleware rewrites to.
 *
 * Not a public endpoint. Nothing links to it, it is absent from the API
 * catalog and the skills index, and it exists only as the rewrite
 * target for a request that named `text/markdown` on `/` or on a blog
 * post. Clients negotiate on the real URL; this path is an
 * implementation detail and may move.
 *
 * Why a route rather than doing the work in middleware: middleware runs
 * in the edge runtime and cannot read the filesystem, and the blog
 * bodies are MDX files on disk.
 *
 * The folder is `%5Fmarkdown` because Next treats a leading underscore
 * as marking a private folder and excludes it from routing;
 * percent-encoding keeps the underscore in the served URL. Same
 * convention as app/api/%5Fsignals. Node's ESM resolver decodes `%5F`
 * back to `_`, so this file cannot be imported by its on-disk path -
 * which is why it is a wrapper and the behaviour lives in
 * lib/markdown-view.ts, where the tests can reach it.
 */
import { MARKDOWN_PATH_HEADER } from '../../../lib/markdown-negotiation.ts';
import { serveMarkdown } from '../../../lib/markdown-view.ts';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: Request): Promise<Response> {
  /* The path arrives as a header because a handler reached through a
     rewrite sees the original request URL, so a query parameter on the
     rewrite target never gets here. serveMarkdown validates it. */
  return serveMarkdown(request.headers.get(MARKDOWN_PATH_HEADER) ?? '');
}
