/**
 * Typed accessor for `data/ask-seed.json`, the canonical Q->A seed
 * the AIO surface (/ask chips, /q/[slug] pre-rendered pages, the FAQ
 * block in /llms-full.txt) all read from.
 *
 * Why one source: rotating chips on /ask, the answer body on
 * /q/<slug>, and the FAQ section in /llms-full.txt are the same
 * conceptual content. Keeping them in one JSON keeps drift out.
 *
 * Read at request time, parsed once, cached for the rest of the
 * process. The file is small (~30 entries, ~25 KB) so re-parsing
 * after a fs change is cheap; we still cache to avoid the round-trip
 * on every render.
 */
import fs from 'node:fs/promises';
import path from 'node:path';

export interface AskSeedItem {
  slug: string;
  q: string;
  a: string;
  tags: string[];
  related: string[];
}

export interface AskSeedFile {
  version: number;
  updated: string;
  notes?: string;
  items: AskSeedItem[];
}

const DATA_PATH = path.resolve(process.cwd(), 'data', 'ask-seed.json');
/**
 * Optional second seed file, supplied by whoever runs the host. Entries
 * here are appended to the base seed and get the same `/q/<slug>` route
 * treatment; a slug that collides with the base seed still throws. The
 * file is absent on a plain checkout and the site renders the base seed
 * alone.
 */
const LOCAL_DATA_PATH = path.resolve(process.cwd(), 'data', 'ask-seed.local.json');

async function readLocalItems(): Promise<AskSeedItem[]> {
  let raw: string;
  try {
    raw = await fs.readFile(LOCAL_DATA_PATH, 'utf8');
  } catch {
    return [];
  }
  const parsed = JSON.parse(raw) as { items?: unknown };
  if (!Array.isArray(parsed.items)) {
    throw new Error('ask-seed.local.json: items[] missing');
  }
  return parsed.items as AskSeedItem[];
}

let _cache: AskSeedFile | null = null;

async function load(): Promise<AskSeedFile> {
  if (_cache) return _cache;
  const raw = await fs.readFile(DATA_PATH, 'utf8');
  const parsed = JSON.parse(raw) as AskSeedFile;
  if (!Array.isArray(parsed.items)) {
    throw new Error('ask-seed.json: items[] missing');
  }
  parsed.items = [...parsed.items, ...(await readLocalItems())];
  /* Defensive: enforce slug uniqueness here so a duplicate slug in the
     seed cannot ship a colliding /q/ route at runtime. Fails the build
     immediately instead of leaving one of the two routes silently
     stale. */
  const seen = new Set<string>();
  for (const item of parsed.items) {
    if (seen.has(item.slug)) {
      throw new Error(`ask-seed: duplicate slug "${item.slug}"`);
    }
    seen.add(item.slug);
  }
  _cache = parsed;
  return _cache;
}

export async function getAllSeedItems(): Promise<AskSeedItem[]> {
  const f = await load();
  return f.items;
}

export async function getSeedItem(slug: string): Promise<AskSeedItem | null> {
  const items = await getAllSeedItems();
  return items.find((it) => it.slug === slug) ?? null;
}

/**
 * The eight-or-so question shapes shown as quick-pick chips on the
 * /ask landing state. Keep this small: a wall of chips is noise. The
 * chip set is curated by index here, not by slug, so a re-order in
 * ask-seed.json doesn't silently shuffle the homepage. A slug that is
 * not in the seed on this deployment is skipped rather than rendering
 * a dead chip.
 */
const CHIP_SLUGS: readonly string[] = [
  'what-is-bernstein',
  'how-does-bernstein-work',
  'how-to-run-multiple-claude-code-agents-in-parallel',
  'bernstein-vs-openai-agents-sdk',
  'bernstein-vs-aider',
  'how-to-install-bernstein',
  'how-does-the-audit-chain-work',
];

export async function getChipQuestions(): Promise<AskSeedItem[]> {
  const all = await getAllSeedItems();
  const bySlug = new Map(all.map((it) => [it.slug, it]));
  const out: AskSeedItem[] = [];
  for (const slug of CHIP_SLUGS) {
    const it = bySlug.get(slug);
    if (it) out.push(it);
  }
  return out;
}
