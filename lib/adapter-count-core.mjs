/**
 * Shared, runtime-free core of the adapter-count resolution.
 *
 * `lib/adapter-count.ts` (request-time, Next fetch cache) and
 * `scripts/sync-adapter-count.mjs` (build step, plain Node) both need the
 * same upstream URLs, the same placeholder exclusions and the same
 * parser. When each carried its own copy the two drifted and the site
 * published two different adapter figures on neighbouring surfaces.
 * Everything either side needs lives here exactly once.
 *
 * Plain `.mjs` on purpose: the build step runs on the Node in the
 * Dockerfile base image (node:20-alpine), which cannot strip TypeScript
 * types. `allowJs` is already on in tsconfig, so the TS side imports
 * this file directly.
 *
 * Source of truth is `bernstein/src/bernstein/adapters/registry.py` -
 * the `_ADAPTERS: dict[...]` literal, plus the entries the same module
 * merges into it on the line below the literal:
 *
 *     _ADAPTERS.update(profile_built_adapter_classes())
 *
 * Reading the literal alone undercounts. A capability profile declared
 * with `implementation=ProfileImplementation.FACTORY` has no adapter
 * module of its own - the factory generates the class - so its registry
 * name appears nowhere in the literal, yet it resolves through
 * `get_adapter` and is enumerated by `iter_adapter_specs` exactly like a
 * hand-written adapter. Profiles declared `MODULE` are declaration-only:
 * their hand-written module still owns the spawn path and their name is
 * already a literal key, so they are not added twice.
 */

export const REGISTRY_URL =
  'https://raw.githubusercontent.com/sipyourdrink-ltd/bernstein/main/src/bernstein/adapters/registry.py';
export const PROFILES_URL =
  'https://raw.githubusercontent.com/sipyourdrink-ltd/bernstein/main/src/bernstein/adapters/capability_profile.py';

/**
 * Offline floor.
 *
 * 49 keys in the `_ADAPTERS` literal, plus the one FACTORY-built
 * capability profile merged in below it, minus the two placeholders in
 * NON_AGENT_KEYS (verified 2026-08-10 against origin/main via
 * countAdapters below).
 *
 * An earlier revision added 1 for `GenericAdapter` on the grounds that
 * it was deliberately kept out of `_ADAPTERS`. That stopped being true:
 * the registry now carries a `"generic"` key, so the increment
 * double-counted it and the published figure ran two too high.
 * `generic` and `mock` are placeholders rather than agents, so both are
 * excluded here and the increment is gone.
 *
 * Bump manually only when the registry changes AND every network path
 * to it is closed; otherwise the live resolution supersedes this.
 */
export const FALLBACK_COUNT = 49;

/**
 * Registry keys that are not agents. Counting them inflates the public
 * figure and puts it at odds with every other surface, which quote the
 * real-agent count.
 */
export const NON_AGENT_KEYS = new Set(['generic', 'mock']);

/**
 * Names of the FACTORY-built capability profiles declared in
 * `capability_profile.py`.
 *
 * The source shape is a tuple of `AdapterCapabilityProfile(...)` calls,
 * so the text is split on the constructor name and each chunk is read
 * for its own `name=` and `implementation=`. Splitting first (rather
 * than one regex over the whole file) keeps the match independent of
 * the order the keyword arguments are written in.
 *
 * @param {string} source
 * @returns {string[]}
 */
export function factoryProfileNames(source) {
  /** @type {string[]} */
  const out = [];
  const chunks = source.split('AdapterCapabilityProfile(').slice(1);
  for (const chunk of chunks) {
    if (!/implementation=ProfileImplementation\.FACTORY\b/.test(chunk)) continue;
    const m = chunk.match(/\bname="([a-z_][a-z0-9_-]*)"/);
    if (m) out.push(m[1]);
  }
  return out;
}

/**
 * Count real adapters from the two upstream sources.
 *
 * Returns `null` - never a guess - whenever the input cannot be trusted
 * (dict not found, braces unbalanced because the fetch truncated, zero
 * keys matched). Callers substitute their own fallback so the "we could
 * not read this" branch stays visible at the call site.
 *
 * @param {string} registrySource contents of registry.py
 * @param {string} profileSource contents of capability_profile.py
 * @returns {number | null}
 */
export function countAdapters(registrySource, profileSource) {
  /* Find the `_ADAPTERS: dict[...] = {` block, then extract just its
     top-level key strings until the closing `}`. Naive but robust for
     the actual file shape - keys are plain string literals on their own
     indented line followed by a colon. */
  const idx = registrySource.indexOf('_ADAPTERS:');
  if (idx < 0) return null;
  const open = registrySource.indexOf('{', idx);
  if (open < 0) return null;
  let depth = 0;
  let i = open;
  for (; i < registrySource.length; i++) {
    if (registrySource[i] === '{') depth++;
    else if (registrySource[i] === '}') {
      depth--;
      if (depth === 0) break;
    }
  }
  /* If we walked off the end without ever closing, the dict is
     malformed (or the source was truncated mid-fetch). Refuse to count
     partial data. */
  if (depth !== 0) return null;
  const block = registrySource.slice(open + 1, i);
  /* Match every line of the form `    "key": Class,` - the regex is
     anchored to start-of-line and a leading quote so test fixture
     references (e.g. comments) don't trigger. */
  const matches = block.match(/^\s*"([a-z_][a-z0-9_-]*)":/gm);
  if (!matches || matches.length === 0) return null;
  const literalKeys = matches.map((line) =>
    line.trim().replace(/^"/, '').replace(/":$/, ''),
  );
  const keys = new Set(literalKeys);
  /* `_ADAPTERS.update(...)` runs after the literal, so a profile name
     that is already a literal key replaces rather than adds. A Set makes
     that the same arithmetic here. */
  for (const name of factoryProfileNames(profileSource)) keys.add(name);
  for (const key of NON_AGENT_KEYS) keys.delete(key);
  if (keys.size === 0) return null;
  return keys.size;
}
