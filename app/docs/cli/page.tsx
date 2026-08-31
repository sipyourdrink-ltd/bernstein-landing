/**
 * /docs/cli - thin index that redirects to the canonical docs site at
 * bernstein.readthedocs.io.
 *
 * History: this surface used to render auto-generated `<cmd> --help`
 * dumps per command + per flag. The auto-generated
 * pages rendered as a wall of text because the extractor collapsed
 * line breaks, and they duplicated the Sphinx docs that already live
 * at readthedocs. Stripped 2026-05-14 - readthedocs is single source
 * of truth.
 *
 * We KEEP this index route so external links to `/docs/cli` don't 404.
 * Server-side 308 redirects to the canonical readthedocs URL; the
 * client never paints "page moved" content.
 */
import type { Metadata } from 'next';
import { permanentRedirect } from 'next/navigation';
import { SITE_URL, AUTHOR, SITE_NAME } from '@/lib/seo';

export const dynamic = 'force-static';
export const revalidate = false;

const CANONICAL_DOCS = 'https://bernstein.readthedocs.io/en/latest/';
const PAGE_URL = `${SITE_URL}/docs/cli`;

export const metadata: Metadata = {
  title: `${SITE_NAME} - CLI docs (moved)`,
  description: `Bernstein CLI reference now lives at ${CANONICAL_DOCS}. Single source of truth, full Sphinx navigation, per-command and per-flag pages.`,
  authors: [{ name: AUTHOR }],
  alternates: { canonical: CANONICAL_DOCS },
  robots: { index: false, follow: true },
};

export default function CliDocsIndexPage(): never {
  // Server-side redirect - keep the entry point useful for any
  // external link or bookmark without rendering a "page moved" flash.
  // `permanentRedirect` (308), not `redirect` (307): the CLI reference
  // is not coming back to this host, so the move is permanent and
  // clients may cache it. The docblock above already described this as
  // a 308; the code was emitting a 307.
  permanentRedirect(CANONICAL_DOCS);
}
