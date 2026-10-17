import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';

/** Entry points without semver guarantees, so their exports need no tags. */
const UNVERSIONED = new Set(['./internal']);

const RE_EXPORT =
  /export\s+(?:type\s+)?\{([^}]*)\}\s*(?:from\s*['"]([^'"]+)['"])?/g;
const STAR = /export\s*\*\s*from\s*['"](\.[^'"]+)['"]/g;
const LOCAL =
  /export\s+(?:declare\s+)?(?:async\s+)?(?:abstract\s+)?(?:function\*?|const|let|class|interface|type|enum)\s+([\w$]+)/g;

const read = (file: string) => readFileSync(file, 'utf8');

const localNames = (file: string): string[] =>
  [...read(file).matchAll(LOCAL)].map((m) => m[1]!);

/** Adds `name` (or every name, for `'*'`) as declared in or re-exported by `file`. */
const collect = (
  out: Map<string, Set<string>>,
  file: string,
  names: ReadonlySet<string> | '*',
  seen: Set<string>,
) => {
  const key = `${file}\0${names === '*' ? '*' : [...names].join(',')}`;
  if (seen.has(key) || !existsSync(file)) return;
  seen.add(key);
  const wants = (name: string) => names === '*' || names.has(name);
  const own = out.get(file) ?? new Set<string>();
  out.set(file, own);
  for (const name of localNames(file)) if (wants(name)) own.add(name);
  const text = read(file);
  for (const [, list, from] of text.matchAll(RE_EXPORT)) {
    const picked = new Set<string>();
    for (const part of list!.split(',')) {
      const [orig, alias] = part
        .replace(/^\s*type\s+/, '')
        .trim()
        .split(/\s+as\s+/);
      if (orig && wants(alias ?? orig)) picked.add(orig);
    }
    if (picked.size === 0) continue;
    if (from === undefined) for (const name of picked) own.add(name);
    else if (from.startsWith('.'))
      collect(out, resolve(dirname(file), from), picked, seen);
  }
  for (const [, from] of text.matchAll(STAR))
    collect(out, resolve(dirname(file), from!), names, seen);
};

const packageRoot = (file: string): string | undefined => {
  for (let dir = dirname(file); dir !== dirname(dir); dir = dirname(dir)) {
    const manifest = join(dir, 'package.json');
    if (existsSync(manifest) && 'exports' in JSON.parse(read(manifest)))
      return dir;
  }
  return undefined;
};

/** The `name` in the `package.json` of `file`'s package. */
export const packageName = (file: string): string | undefined => {
  const root = packageRoot(file);
  return root === undefined
    ? undefined
    : (JSON.parse(read(join(root, 'package.json'))).name as string);
};

const cache = new Map<string, Map<string, Set<string>>>();

/** Names each file of `file`'s package contributes to its versioned entry points. */
export const publicNames = (file: string): ReadonlySet<string> => {
  const root = packageRoot(file);
  if (root === undefined) return new Set();
  let byFile = cache.get(root);
  if (!byFile) {
    byFile = new Map();
    const exports = JSON.parse(read(join(root, 'package.json'))).exports as
      Record<string, string | { default?: string }> | undefined;
    const seen = new Set<string>();
    for (const [subpath, target] of Object.entries(exports ?? {})) {
      if (UNVERSIONED.has(subpath)) continue;
      const entry = typeof target === 'string' ? target : target.default;
      if (entry?.endsWith('.ts')) collect(byFile, join(root, entry), '*', seen);
    }
    cache.set(root, byFile);
  }
  return byFile.get(file) ?? new Set();
};
