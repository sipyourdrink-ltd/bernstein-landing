import fs from 'node:fs';
import path from 'node:path';

/**
 * Topic-cluster picker for /blog cross-linking.
 *
 * The YAML at content/blog/_clusters.yaml is a hand-curated hub-and-spoke
 * map: posts → cluster slug. RelatedPosts.tsx renders 3-5 siblings per
 * post, picked deterministically so two visits to the same URL produce
 * the same DOM (matters for crawler stability and snapshot tests).
 *
 * Why a tiny hand-rolled YAML parser:
 *   - the project avoids new npm deps (see tests/funding-yml.test.ts
 *     for the precedent).
 *   - the schema is fixed: a single top-level `clusters:` map, each
 *     value has `fallback: <slug>` and `posts: [<slug>, ...]`. No
 *     anchors, no nested structures, no quoting beyond ASCII slugs.
 *   - a real YAML parser would happily accept inputs we don't want
 *     here (cyclic anchors, exotic literals); the narrow parser
 *     enforces the shape and produces a clearer build error.
 *
 * Re-derives BLOG_DIR rather than importing from lib/mdx.ts because
 * lib/mdx.ts imports back from this module for the build-time check
 * (would be a circular module load otherwise).
 */
const BLOG_DIR = path.resolve(process.cwd(), 'content', 'blog');

export const CLUSTERS_PATH = path.resolve(BLOG_DIR, '_clusters.yaml');

export interface Cluster {
  /** Cluster slug (the YAML key, e.g. `routing`). */
  name: string;
  /** Slug of the cluster used to fill siblings when this one is short. */
  fallback: string;
  /** Post slugs that belong to this cluster, in declared order. */
  posts: string[];
}

export interface ClusterMap {
  /** Insertion-order map from cluster slug to its Cluster record. */
  byName: Map<string, Cluster>;
  /** Cluster slugs in declared order - used to pick a post's PRIMARY
   *  cluster (the first that lists the post). */
  order: string[];
}

/**
 * Parse the narrow `_clusters.yaml` shape. Throws on any deviation
 * from the documented layout so a malformed edit fails the build
 * loudly rather than silently dropping a post.
 */
export function parseClustersYaml(raw: string): ClusterMap {
  const lines = raw.split(/\r?\n/);
  const byName = new Map<string, Cluster>();
  const order: string[] = [];

  let sawClustersRoot = false;
  /* Currently-being-built cluster (top-level entry under `clusters:`). */
  let current: Cluster | null = null;
  /* Currently being filled list (so we know `- item` lines append here). */
  let inPostsList = false;

  for (let i = 0; i < lines.length; i++) {
    const rawLine = lines[i];
    /* Strip trailing `# ...` comments. Slugs are kebab-case ASCII so
       there's no ambiguity with literal `#` inside a value. */
    const noComment = rawLine.replace(/\s+#.*$/, '').replace(/^\s*#.*$/, '');
    if (!noComment.trim()) continue;

    /* Top-level `clusters:` opener - must precede everything else. */
    if (/^clusters:\s*$/.test(noComment)) {
      sawClustersRoot = true;
      continue;
    }
    if (!sawClustersRoot) {
      throw new Error(
        `clusters.yaml: expected "clusters:" before any other content (line ${i + 1})`,
      );
    }

    /* A cluster declaration: two-space indent + `<slug>:` on its own. */
    const clusterDecl = noComment.match(/^ {2}([a-z][a-z0-9-]*):\s*$/);
    if (clusterDecl) {
      const name = clusterDecl[1];
      if (byName.has(name)) {
        throw new Error(`clusters.yaml: duplicate cluster "${name}"`);
      }
      current = { name, fallback: '', posts: [] };
      byName.set(name, current);
      order.push(name);
      inPostsList = false;
      continue;
    }

    if (!current) {
      throw new Error(
        `clusters.yaml: unexpected content before first cluster (line ${i + 1}): ${JSON.stringify(rawLine)}`,
      );
    }

    /* A scalar field: 4-space indent + `key: value`. */
    const scalar = noComment.match(/^ {4}([a-z][a-z_]*):\s*(.*?)\s*$/);
    if (scalar) {
      const [, key, value] = scalar;
      inPostsList = false;
      if (key === 'fallback') {
        if (!value) {
          throw new Error(
            `clusters.yaml: cluster "${current.name}" has empty fallback`,
          );
        }
        current.fallback = value;
        continue;
      }
      if (key === 'posts') {
        if (value !== '') {
          throw new Error(
            `clusters.yaml: cluster "${current.name}" posts: must be a YAML list, got "${value}"`,
          );
        }
        inPostsList = true;
        continue;
      }
      throw new Error(
        `clusters.yaml: cluster "${current.name}" has unknown field "${key}"`,
      );
    }

    /* List item: 6-space indent + `- <slug>`. */
    const listItem = noComment.match(/^ {6}- ([a-z0-9][a-z0-9-]*)\s*$/);
    if (listItem) {
      if (!inPostsList) {
        throw new Error(
          `clusters.yaml: list item without an open posts: list (line ${i + 1})`,
        );
      }
      current.posts.push(listItem[1]);
      continue;
    }

    throw new Error(
      `clusters.yaml: unrecognised line ${i + 1}: ${JSON.stringify(rawLine)}`,
    );
  }

  if (byName.size === 0) {
    throw new Error('clusters.yaml: no clusters declared');
  }

  /* Validate fallback links - every cluster's `fallback` must name an
     existing cluster. Catches typos that would silently turn the
     fallback into a no-op. */
  for (const cluster of byName.values()) {
    if (!cluster.fallback) {
      throw new Error(`clusters.yaml: cluster "${cluster.name}" missing fallback`);
    }
    if (!byName.has(cluster.fallback)) {
      throw new Error(
        `clusters.yaml: cluster "${cluster.name}" fallback "${cluster.fallback}" is not a declared cluster`,
      );
    }
  }

  return { byName, order };
}

let cachedMap: ClusterMap | null = null;

/** Load + cache the cluster map. Synchronous: the file is small,
 *  reading it once at first call avoids threading async through the
 *  RSC tree. Throws if the file is missing or malformed - the build
 *  surface for these errors is intentional. */
export function loadClusters(): ClusterMap {
  if (cachedMap) return cachedMap;
  const raw = fs.readFileSync(CLUSTERS_PATH, 'utf8');
  cachedMap = parseClustersYaml(raw);
  return cachedMap;
}

/** Returns the slug of the cluster a post primarily belongs to, or
 *  null if the post isn't in any cluster. "Primary" = first cluster
 *  (in YAML declaration order) that lists the post. */
export function primaryClusterFor(
  slug: string,
  map: ClusterMap = loadClusters(),
): string | null {
  for (const name of map.order) {
    const cluster = map.byName.get(name);
    if (cluster?.posts.includes(slug)) return name;
  }
  return null;
}

/** Build-time check: every passed slug must be in at least one
 *  cluster. Throws an explicit error naming the missing slugs so the
 *  build log points the operator at the YAML edit needed. */
export function assertAllPostsClustered(slugs: readonly string[]): void {
  const map = loadClusters();
  const missing: string[] = [];
  for (const slug of slugs) {
    if (!primaryClusterFor(slug, map)) missing.push(slug);
  }
  if (missing.length > 0) {
    throw new Error(
      `clusters.yaml: missing entry for ${missing.length} post(s): ${missing.join(', ')}. ` +
        `Every post under content/blog/ must appear in at least one cluster's posts: list.`,
    );
  }
}

export interface PickOptions {
  /** Soft floor. The picker returns whatever it has even when the floor
   *  isn't met (because the alternative is throwing inside a RSC render).
   *  Today this is informational; reserved for future callers that want
   *  to elide the strip when too few siblings are available. */
  min?: number;
  /** Hard cap on returned siblings. */
  max?: number;
}

/** Deterministically pick siblings for a post. Order is:
 *    1. primary cluster posts (excluding self), sorted by slug
 *    2. (only if step 1 < max) fallback cluster posts, sorted by slug
 *  Caps the total at `max`. Never includes the input slug. */
export function pickSiblings(
  slug: string,
  options: PickOptions = {},
  map: ClusterMap = loadClusters(),
): string[] {
  /* `min` is the documented soft-floor parameter. We accept it for
     forward-compatibility with the original ticket contract; the
     current picker never elides the strip even when below the floor. */
  void options.min;
  const max = options.max ?? 5;

  const primaryName = primaryClusterFor(slug, map);
  if (!primaryName) return [];
  const primary = map.byName.get(primaryName);
  if (!primary) return [];

  const picked: string[] = [];
  const seen = new Set<string>([slug]);

  const primarySiblings = primary.posts
    .filter((s) => !seen.has(s))
    .sort();
  for (const s of primarySiblings) {
    if (picked.length >= max) break;
    if (seen.has(s)) continue;
    picked.push(s);
    seen.add(s);
  }

  /* Top up from fallback when the primary cluster is short. We fill
     all the way to `max` (not just `min`) so small-cluster posts get
     the same sibling density as posts in the agents cluster - the
     ticket's stated goal is ≥ 4-6 topical siblings per page, and
     stopping at `min` would leave small-cluster pages visibly thinner
     than their large-cluster neighbours. */
  if (picked.length < max) {
    const fallback = map.byName.get(primary.fallback);
    if (fallback) {
      const fallbackSiblings = fallback.posts
        .filter((s) => !seen.has(s))
        .sort();
      for (const s of fallbackSiblings) {
        if (picked.length >= max) break;
        if (seen.has(s)) continue;
        picked.push(s);
        seen.add(s);
      }
    }
  }

  return picked.slice(0, max);
}
