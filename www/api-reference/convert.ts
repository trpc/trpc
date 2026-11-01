/**
 * Turns TypeDoc's markdown (`out/<package>/…`) into pages of the v11 docs,
 * at the URLs trpc.io's Docusaurus site served them: `<dir>/index.md` was
 * `/docs/typedoc/<dir>/`, so it becomes `typedoc/<dir>.md`, and every other
 * file keeps its path. Each page gets the site's frontmatter, nests under its
 * module and package in the sidebar's API Reference section, and its links
 * to other pages are rewritten for their new files.
 */
import {
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { dirname, join, posix, relative, sep } from 'node:path';

export const referenceSection = 'API Reference';

/** TypeDoc's group folders, in the order it lists the groups. */
const groups = [
  'namespaces',
  'enumerations',
  'classes',
  'interfaces',
  'type-aliases',
  'variables',
  'functions',
];

/** The page a TypeDoc file becomes, by its path under `out/`, without `.md`. */
export function referenceSlug(file: string) {
  return `typedoc/${file.replace(/\.md$/, '').replace(/\/index$/, '')}`;
}

/** The nearest page whose path prefixes `slug`'s. */
export function referenceParent(
  slug: string,
  slugs: ReadonlySet<string>,
): string | undefined {
  const parts = slug.split('/');
  for (let end = parts.length - 1; end > 1; end--) {
    const prefix = parts.slice(0, end).join('/');
    if (slugs.has(prefix)) {
      return prefix;
    }
  }
  return undefined;
}

/** Packages first, in sidebar order, then modules, then each group's pages by name. */
function sortKey(slug: string, packages: ReadonlyArray<string>) {
  const parts = slug.split('/').slice(1);
  const group = parts.findLastIndex((part) => groups.includes(part));
  return [
    packages.indexOf(parts[0] ?? ''),
    group === -1 ? '' : parts.slice(0, group).join('/'),
    group === -1 ? -1 : groups.indexOf(parts[group] ?? ''),
    parts.join('/'),
  ] as const;
}

function compareKeys(
  a: ReturnType<typeof sortKey>,
  b: ReturnType<typeof sortKey>,
) {
  return (
    a[0] - b[0] ||
    a[1].localeCompare(b[1]) ||
    a[2] - b[2] ||
    a[3].localeCompare(b[3])
  );
}

const unescapeMarkdown = (text: string) =>
  text.replaceAll(/\\([!-/:-@[-`{-~])/g, '$1');

/** The page's label in the sidebar: the package, a module's path in it, or the name. */
function labelOf(slug: string, parent: string | undefined) {
  const parts = slug.split('/').slice(1);
  if (parent === undefined) {
    return `@trpc/${parts.join('/')}`;
  }
  return parent.split('/').length === 2
    ? parts.slice(1).join('/')
    : (parts.at(-1) ?? slug);
}

function markdownFiles(dir: string): ReadonlyArray<string> {
  return readdirSync(dir, { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith('.md'))
    .map((entry) =>
      relative(dir, join(entry.parentPath, entry.name)).split(sep).join('/'),
    );
}

/** Writes the pages under `to`, and returns how many. */
export function convertReference(options: {
  readonly from: string;
  readonly packages: ReadonlyArray<string>;
  readonly to: string;
}) {
  const files = markdownFiles(options.from);
  const slugOf = new Map(files.map((file) => [file, referenceSlug(file)]));
  const slugs = new Set(slugOf.values());
  if (slugs.size !== files.length) {
    throw new Error('Two TypeDoc files map to the same API reference page');
  }
  const ordered = files.toSorted((a, b) =>
    compareKeys(
      sortKey(slugOf.get(a)!, options.packages),
      sortKey(slugOf.get(b)!, options.packages),
    ),
  );
  rmSync(options.to, { force: true, recursive: true });
  ordered.forEach((file, index) => {
    // SAFETY: `slugOf` has every file.
    const slug = slugOf.get(file)!;
    const raw = readFileSync(join(options.from, file), 'utf8');
    const heading = /^# (.+)\n+/.exec(raw);
    const title = unescapeMarkdown(heading?.[1] ?? slug);
    const body = heading ? raw.slice(heading[0].length) : raw;
    const linked = body.replaceAll(
      /\]\((?![a-z][a-z\d+.-]*:|#|\/)([^)#\s]+\.md)(#[^)\s]*)?\)/gi,
      (match, target: string, hash: string | undefined) => {
        const resolved = posix.join(posix.dirname(file), target);
        const targetSlug = slugOf.get(resolved);
        if (targetSlug === undefined) {
          return match;
        }
        const link = posix.relative(posix.dirname(slug), `${targetSlug}.md`);
        return `](${link}${hash ?? ''})`;
      },
    );
    const parent = referenceParent(slug, slugs);
    const frontmatter = {
      title,
      label: labelOf(slug, parent),
      description: '',
      section: referenceSection,
      ...(parent === undefined ? {} : { parent }),
      order: index + 1,
    };
    const yaml = Object.entries(frontmatter)
      .map(([key, value]) => `${key}: ${JSON.stringify(value)}`)
      .join('\n');
    const out = join(options.to, `${slug.slice('typedoc/'.length)}.md`);
    mkdirSync(dirname(out), { recursive: true });
    writeFileSync(out, `---\n${yaml}\n---\n\n${linked}`);
  });
  return files.length;
}
