/**
 * Typed accessor for the build-generated `data/adapters.json`.
 *
 * The JSON is produced by `scripts/extract-adapters.mjs` reading the
 * sibling bernstein clone. Code consumes it through this module so a
 * future shape change (add a field, rename one) lands in one place.
 */
import fs from 'node:fs/promises';
import path from 'node:path';

export type Verified = { upstream: string; date: string };

export type Adapter = {
  slug: string;
  name: string;
  cls: string;
  displayName: string;
  docstring: string;
  install: string;
  verified: Verified | null;
  category: string;
  sourceFile: string;
  license: string | null;
  auth: string | null;
  parallelSafe: boolean | null;
  mcpSupport: boolean | null;
  auditChain: boolean;
  homepage: string | null;
  summary: string | null;
  whenToChoose: string | null;
  whenToChooseBernstein: string | null;
  ready: boolean;
};

export type AdaptersFile = {
  version: number;
  builtAt: string;
  bernsteinRepoPath: string;
  adapters: Adapter[];
};

const DATA_PATH = path.resolve(process.cwd(), 'data', 'adapters.json');

let _cache: AdaptersFile | null = null;

async function load(): Promise<AdaptersFile> {
  if (_cache) return _cache;
  const raw = await fs.readFile(DATA_PATH, 'utf8');
  _cache = JSON.parse(raw) as AdaptersFile;
  return _cache;
}

export async function getAllAdapters(): Promise<Adapter[]> {
  const f = await load();
  return f.adapters;
}

export async function getReadyAdapters(): Promise<Adapter[]> {
  const f = await load();
  return f.adapters.filter((a) => a.ready);
}

export async function getAdapter(slug: string): Promise<Adapter | null> {
  const f = await load();
  return f.adapters.find((a) => a.slug === slug) ?? null;
}
