/**
 * Typed accessor for the build-generated `data/cli.json`.
 *
 * Produced by `scripts/extract-cli.mjs` from the live `bernstein
 * --help` output (when bernstein is on PATH) or the operator-curated
 * seed catalog (`data/cli-seed.json`). Code consumes it through this
 * module so adding a field lands in one place.
 */
import fs from 'node:fs/promises';
import path from 'node:path';

export type CliFlag = {
  spec: string;
  flags: string[];
  primary: string;
  type: string;
  help: string;
  default: string | null;
  slug: string;
  ready: boolean;
};

export type CliSubcommand = { name: string; help: string };

export type CliCommand = {
  name: string;
  slug: string;
  summary: string;
  usage: string;
  description: string;
  flags: CliFlag[];
  subcommands: CliSubcommand[];
  ready: boolean;
};

export type CliFile = {
  version: number;
  builtAt: string;
  source: 'live' | 'seed';
  root: {
    usage: string;
    description: string;
    flags: CliFlag[];
    subcommands: CliSubcommand[];
  };
  commands: CliCommand[];
};

const DATA_PATH = path.resolve(process.cwd(), 'data', 'cli.json');

let _cache: CliFile | null = null;

async function load(): Promise<CliFile> {
  if (_cache) return _cache;
  const raw = await fs.readFile(DATA_PATH, 'utf8');
  _cache = JSON.parse(raw) as CliFile;
  return _cache;
}

export async function getAllCommands(): Promise<CliCommand[]> {
  const f = await load();
  return f.commands;
}

export async function getReadyCommands(): Promise<CliCommand[]> {
  const f = await load();
  return f.commands.filter((c) => c.ready);
}

export async function getCommand(slug: string): Promise<CliCommand | null> {
  const f = await load();
  return f.commands.find((c) => c.slug === slug) ?? null;
}

export async function getReadyFlagPages(): Promise<
  { command: string; flag: string }[]
> {
  const f = await load();
  const out: { command: string; flag: string }[] = [];
  for (const c of f.commands) {
    if (!c.ready) continue;
    for (const flag of c.flags) {
      if (flag.ready) {
        out.push({ command: c.slug, flag: flag.slug });
      }
    }
  }
  return out;
}
