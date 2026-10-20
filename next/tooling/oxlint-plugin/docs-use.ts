import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';

/** Where a package or one of its exports is documented: on listed pages, and in which hidden experiments. */
export interface DocsUse {
  readonly listed: boolean;
  readonly experiments: ReadonlySet<string>;
}

interface Index {
  /** By package, then export name; from `import { … } from '<package>…'` in code blocks. */
  readonly imports: Map<
    string,
    Map<string, { listed: boolean; experiments: Set<string> }>
  >;
  /** By package; from imports, installs and `` `<package>` `` in prose. */
  readonly packages: Map<string, { listed: boolean; experiments: Set<string> }>;
  /** Names that start an inline code span in a listed page's prose: `` `isTrpcError(value)` ``, `` `await loadRouter(router)` ``. */
  readonly listedMentions: Set<string>;
}

const FENCE = /^```[^\n]*\n[\s\S]*?^```/gm;
const IMPORT =
  /import\s+(?:type\s+)?\{([^}]*)\}\s*from\s*['"](@[\w-]+\/[\w-]+)(?:\/[^'"]*)?['"]/g;
const PACKAGE = /(@[\w-]+\/[\w-]+)/g;
const SPAN = /`(?:await |new |yield\* )?([A-Za-z_$][\w$]*)(?=[`(<.])/g;

const walk = (dir: string): string[] =>
  readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? walk(path) : [path];
  });

const entry = <K, V>(map: Map<K, V>, key: K, make: () => V) => {
  const existing = map.get(key);
  if (existing !== undefined) return existing;
  const made = make();
  map.set(key, made);
  return made;
};

const use = () => ({ listed: false, experiments: new Set<string>() });

const build = (docs: string): Index => {
  const index: Index = {
    imports: new Map(),
    packages: new Map(),
    listedMentions: new Set(),
  };
  for (const file of walk(docs).filter((f) => f.endsWith('.md'))) {
    const text = readFileSync(file, 'utf8');
    const frontmatter = text.startsWith('---\n')
      ? text.slice(0, text.indexOf('\n---', 4))
      : '';
    const experiment = /^experiment:\s*(\S+)/m.exec(frontmatter)?.[1];
    const mark = (target: { listed: boolean; experiments: Set<string> }) => {
      if (experiment === undefined) target.listed = true;
      else target.experiments.add(experiment);
    };
    const blocks = text.match(FENCE) ?? [];
    for (const block of blocks) {
      for (const [, list, pkg] of block.matchAll(IMPORT)) {
        mark(entry(index.packages, pkg!, use));
        const names = entry(index.imports, pkg!, () => new Map());
        for (const part of list!.split(',')) {
          const name = part
            .replace(/^\s*type\s+/, '')
            .trim()
            .split(/\s+as\s+/)[0];
          if (name) mark(entry(names, name, use));
        }
      }
      if (block.startsWith('```package-install')) {
        for (const [, pkg] of block.matchAll(PACKAGE))
          mark(entry(index.packages, pkg!, use));
      }
    }
    const prose = text.slice(frontmatter.length).replace(FENCE, '');
    for (const [, pkg] of prose.matchAll(/`(@[\w-]+\/[\w-]+)[`/]/g))
      mark(entry(index.packages, pkg!, use));
    if (experiment === undefined) {
      for (const [, name] of prose.matchAll(SPAN))
        index.listedMentions.add(name!);
    }
  }
  return index;
};

const cache = new Map<string, Index>();

/** The nearest `www/docs/` above `root`, the package's directory. */
const docsDir = (root: string): string | undefined => {
  for (let dir = dirname(root); dir !== dirname(dir); dir = dirname(dir)) {
    const docs = join(dir, 'www', 'docs');
    if (existsSync(docs) && statSync(docs).isDirectory()) return docs;
  }
  return undefined;
};

const indexFor = (root: string): Index | undefined => {
  const docs = docsDir(root);
  if (docs === undefined) return undefined;
  return entry(cache, docs, () => build(docs));
};

const none: DocsUse = { listed: false, experiments: new Set() };

/** Where the docs above `root` use package `pkg`. */
export const packageUse = (root: string, pkg: string): DocsUse =>
  indexFor(root)?.packages.get(pkg) ?? none;

/**
 * Where the docs above `root` document `name` from `pkg`: hidden when a page
 * in an experiment imports it, listed when a listed page imports it or names
 * it in an inline code span.
 */
export const exportUse = (root: string, pkg: string, name: string): DocsUse => {
  const index = indexFor(root);
  if (index === undefined) return none;
  const imported = index.imports.get(pkg)?.get(name) ?? none;
  return {
    listed: imported.listed || index.listedMentions.has(name),
    experiments: imported.experiments,
  };
};
