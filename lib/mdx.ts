import fs from 'node:fs/promises';
import path from 'node:path';
import matter from 'gray-matter';
import { z } from 'zod';
import readingTime from 'reading-time';
import { compileMDX } from 'next-mdx-remote/rsc';
import { extractTableOfContents, type TableOfContentsItem } from '@/lib/blog-headings';
import { Callout } from '@/components/blog/Callout';
import { Lead } from '@/components/blog/Lead';
import { Figure } from '@/components/blog/Figure';
import { SmartLink } from '@/components/blog/SmartLink';
import { InlineCode } from '@/components/blog/InlineCode';
import { CodeBlock } from '@/components/blog/CodeBlock';
import { MdxH2 } from '@/components/blog/MdxH2';
import { MdxH3 } from '@/components/blog/MdxH3';
import { Mermaid } from '@/components/blog/Mermaid';
import { assertAllPostsClustered, primaryClusterFor } from '@/lib/clusters';

export const BLOG_DIR = path.resolve(process.cwd(), 'content', 'blog');

const isoDate = (v: string | Date) =>
  v instanceof Date ? v.toISOString().split('T')[0] : v;

export const Frontmatter = z.object({
  title: z.string().min(3),
  description: z.string().min(3),
  /**
   * Optional SERP-only title override. When present and ≤60 chars it
   * replaces the word-boundary-trimmed `title` in <head>; the visible
   * H1 still uses `title`. Lets authors hand-tune titles that would
   * otherwise get auto-cut at the 48-char post-title slot
   * (template ' | Bernstein' = 12 chars, SERP cap = 60). Hard-limited
   * to 60 so a misconfigured override can't blow past the SERP cap
   * itself. Frontmatter validation fails fast on a longer string.
   */
  seo_title: z.string().min(3).max(60).optional(),
  date: z.union([z.string(), z.date()]).transform(isoDate),
  /**
   * Optional last-edit timestamp. When set the sitemap emits this as
   * `<lastmod>` and Article-shaped JSON-LD uses it for `dateModified`.
   * Defaults to `date` when absent. Driven by ticket
   * `2026-05-12-action-005-howto-techarticle-schema-on-blog` so the
   * schema-tier upgrade triggers a re-crawl on the affected posts
   * without rewriting their publish dates.
   */
  dateModified: z.union([z.string(), z.date()]).transform(isoDate).optional(),
  tags: z.array(z.string()).optional(),
  draft: z.boolean().optional(),
  /**
   * Surfaces the post in the home-page "from the blog" strip. Curated
   * by hand against the GSC top-impression set so the home internal
   * link graph passes pagerank to the posts the index page is already
   * earning impressions for. See ticket
   * `.sdd/backlog/open/2026-05-12-action-001-home-internal-link-graph-rebuild.md`.
   */
  featured: z.boolean().optional(),
  hero: z.string().optional(),
  /**
   * JSON-LD tier for the post. Drives the secondary `<script>` block
   * emitted alongside the universal BlogPosting node. `HowTo` posts
   * supply `howToSteps`; `TechArticle` posts supply `techDependencies`.
   * Default is BlogPosting (which means no extra block). Ticket:
   * `2026-05-12-action-005-howto-techarticle-schema-on-blog`.
   */
  schemaType: z.enum(['HowTo', 'TechArticle', 'BlogPosting']).optional(),
  /**
   * Ordered HowTo step list. Each `name` mirrors a body H2 so the
   * human reader and the LLM citation see the same sequence; `text`
   * is a short factual paraphrase of that section. Total JSON-LD
   * weight is capped at 5 KB per Google's de-prioritisation threshold
   * - keep step text terse.
   */
  howToSteps: z
    .array(
      z.object({
        name: z.string().min(1),
        text: z.string().min(1),
      }),
    )
    .optional(),
  /**
   * TechArticle.dependencies - real prerequisites pulled from the
   * post body (runtime versions, CLI tools, accounts). Renders as a
   * separator-joined string per schema.org guidance.
   */
  techDependencies: z.array(z.string().min(1)).optional(),
});
export type FrontmatterT = z.infer<typeof Frontmatter>;

export type PostIndex = {
  slug: string;
  fm: FrontmatterT;
  readingMinutes: number;
};

export type PostResult = {
  mdx: React.ReactNode;
  fm: FrontmatterT;
  readingMinutes: number;
  tableOfContents: TableOfContentsItem[];
};

const mdxComponents = {
  Callout,
  Lead,
  Figure,
  Mermaid,
  a: SmartLink,
  code: InlineCode,
  h2: MdxH2,
  h3: MdxH3,
  pre: CodeBlock,
};

async function listDirs(dir: string): Promise<string[]> {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  return entries.filter((e) => e.isDirectory()).map((e) => e.name);
}

export async function getAllPosts(): Promise<PostIndex[]> {
  const slugs = await listDirs(BLOG_DIR);
  const posts: PostIndex[] = [];
  for (const slug of slugs) {
    const raw = await fs.readFile(path.join(BLOG_DIR, slug, 'index.mdx'), 'utf8');
    const { data, content } = matter(raw);
    const fm = Frontmatter.parse(data);
    if (fm.draft) continue;
    posts.push({ slug, fm, readingMinutes: Math.max(1, Math.ceil(readingTime(content).minutes)) });
  }
  /* Build-time invariant: every published post belongs to ≥ 1 cluster
     in content/blog/_clusters.yaml. The RelatedPosts strip depends on
     this - a post without a cluster would render with 0 siblings,
     silently regressing the hub-and-spoke link graph that action-004
     (2026-05-12) installed. Throwing here fails `next build`, which
     is what we want. Drafts are skipped above, so the assertion runs
     over published slugs only. */
  assertAllPostsClustered(posts.map((p) => p.slug));
  return posts.sort((a, b) => (a.fm.date < b.fm.date ? 1 : -1));
}

export async function getPost(slug: string): Promise<PostResult | null> {
  let raw: string;
  try {
    raw = await fs.readFile(path.join(BLOG_DIR, slug, 'index.mdx'), 'utf8');
  } catch {
    /* Genuine missing-file 404. Don't trip the cluster guard for
       arbitrary slugs that came in off a random URL - only published
       posts must be clustered. */
    return null;
  }
  /* Per-slug cluster guard, fired AFTER we know the file exists. The
     build-time invariant (every published post belongs to ≥ 1 cluster)
     would otherwise turn into a silent 404, which is what action-004
     (2026-05-12) was trying to prevent. Lives OUTSIDE the parse/compile
     try/catch below so a missing cluster entry fails the build loudly. */
  if (!primaryClusterFor(slug)) {
    throw new Error(
      `post "${slug}" is not listed in any cluster. Add it to content/blog/_clusters.yaml.`,
    );
  }
  try {
    const { data, content } = matter(raw);
    const fm = Frontmatter.parse(data);
    if (fm.draft) return null;

    const [remarkGfm, rehypePrettyCode] = await Promise.all([
      import('remark-gfm').then((m) => m.default),
      import('rehype-pretty-code').then((m) => m.default),
    ]);

    const { content: mdx } = await compileMDX({
      source: content,
      components: mdxComponents,
      options: {
        mdxOptions: {
          remarkPlugins: [remarkGfm],
          rehypePlugins: [
            [rehypePrettyCode, {
              theme: { dark: 'github-dark', light: 'github-light' },
              keepBackground: false,
              defaultLang: 'plaintext',
            }],
          ],
        },
      },
    });

    return {
      mdx,
      fm,
      readingMinutes: Math.max(1, Math.ceil(readingTime(content).minutes)),
      tableOfContents: extractTableOfContents(content),
    };
  } catch (error) {
    console.error(`Error getting post ${slug}:`, error);
    return null;
  }
}

export async function getSlugs(): Promise<string[]> {
  return listDirs(BLOG_DIR);
}

/**
 * Returns posts flagged with `featured: true` in their MDX frontmatter,
 * sorted newest first. Drives the home-page "from the blog" strip
 * (PageRank repair - see `.sdd/backlog/open/2026-05-12-action-001-…`).
 * Curated by hand: the three slugs flagged today are the top-impression
 * posts from the 2026-05-13 GSC pull. The caller may slice to a fixed
 * count (3) but we don't enforce that here - adding/removing flags is
 * the editorial lever.
 */
export async function getFeaturedPosts(): Promise<PostIndex[]> {
  const all = await getAllPosts();
  return all.filter((p) => p.fm.featured === true);
}

/**
 * Number of published posts, drafts excluded.
 *
 * Surfaces that advertise the corpus size (the hero's ask-the-docs
 * kicker, for one) counted it by hand and stopped being right the next
 * time anyone published. Deriving it from the same directory listing the
 * blog index uses means the claim cannot drift from the content.
 */
export async function getPostCount(): Promise<number> {
  return (await getAllPosts()).length;
}
