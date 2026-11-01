/**
 * Turns the docs trpc.io serves (Docusaurus MDX in `v11/www`:
 * v11 in `docs/`, v10 and v9 in `versioned_docs/`) and its blog (`blog/`)
 * into pages and posts of this site: Markdown with this site's frontmatter,
 * which `build/content.ts` and `build/blog-content.ts` render.
 * `old-docs-copy.ts` reads the files and writes the result; everything here
 * is a pure function of them.
 *
 * v11's Twoslash blocks stay Twoslash blocks, which the site compiles in the
 * `v11` sample app as trpc.io compiled them; elsewhere they become plain
 * code, showing what trpc.io shows: the hidden setup, `// @…` directives and
 * `// ^?` markers go. Either way `// @include:` is expanded. Admonitions become
 * alerts, `<Tabs>` become tab groups, partials and the few components the
 * pages use are inlined, and links point at the copied pages of any
 * version, after trpc.io's redirects, or at trpc.io for anything else.
 * Whatever the copy can't convert is a problem, so a new construct in the
 * docs fails the copy instead of rendering as raw MDX.
 */
import { removeTwoslashNotations } from 'twoslash/fallback';

import { type CopiedVersion, copiedVersions, v11 } from '../src/site.ts';

/** A page of a version's sidebar. */
export interface CopiedPage {
  readonly description: string;
  /** Path under `www/`: `docs/server/procedures.md`. */
  readonly file: string;
  /** Its sidebar label, where it differs from the title. */
  readonly label: string | undefined;
  /** Position in the sidebar, from 0. */
  readonly order: number;
  /** The slug of the page it nests under in the sidebar. */
  readonly parent: string | undefined;
  readonly section: string;
  /** Path under the version's `trpcPath` on trpc.io, and its `basePath` here. */
  readonly slug: string;
  readonly title: string;
  readonly version: CopiedVersion['id'];
}

/** A redirect of trpc.io's (`www/vercel.json`): `/docs/reactjs/:path` to `/docs/client/react/:path`. */
export interface Redirect {
  readonly destination: string;
  /** Vercel's default is `true`. */
  readonly permanent?: boolean | undefined;
  readonly source: string;
}

/** A version's last release: its tag, and the files and dirs the repo had at it. */
export interface Release {
  readonly paths: ReadonlySet<string>;
  readonly tag: string;
}

/** A post's author, as `blog/authors.yml` or the post's own frontmatter has them. */
export interface PostAuthor {
  readonly image: string | undefined;
  readonly name: string;
  readonly title: string | undefined;
  readonly url: string | undefined;
}

/** A post of trpc.io's blog (`www/blog`). */
export interface CopiedPost {
  readonly authors: ReadonlyArray<PostAuthor>;
  /** `2025-03-21`, from the file's name. */
  readonly date: string;
  /** The GitHub discussion that holds its comments. */
  readonly discussion: number | undefined;
  /** Path under `www/`: `blog/2025-03-21-announcing-trpc-11.mdx`. */
  readonly file: string;
  /** Path under `/blog`, on trpc.io and here. */
  readonly slug: string;
  readonly title: string;
}

/**
 * The page a link is on: a page of a version's docs, or a blog post
 * (`blog`), which links as v11's pages do, since trpc.io's blog means the
 * docs it serves at `/docs`.
 */
export interface LinkingPage {
  readonly blog?: boolean | undefined;
  readonly slug: string;
  readonly version: CopiedVersion['id'];
}

export interface CopiedDocs {
  /** What the pages read, by path under `www/`: the pages, partials and components. */
  readonly files: ReadonlyMap<string, string>;
  /** Every version's pages. */
  readonly pages: ReadonlyArray<CopiedPage>;
  /** The blog's posts. */
  readonly posts: ReadonlyArray<CopiedPost>;
  readonly redirects: ReadonlyArray<Redirect>;
  /** The older versions' last releases. */
  readonly releases: ReadonlyMap<CopiedVersion['id'], Release>;
  /**
   * Docs no sidebar lists, which trpc.io still serves: their URL paths, by
   * path under `www/`.
   */
  readonly unlisted: ReadonlyMap<string, string>;
}

export function versionOf(id: CopiedVersion['id']): CopiedVersion {
  return copiedVersions.find((version) => version.id === id) ?? v11;
}

/** The copied versions, the longest `trpcPath` first, so `/docs/v10` isn't read as v11's `v10` page. */
const byTrpcPath = copiedVersions.toSorted(
  (a, b) => b.trpcPath.length - a.trpcPath.length,
);

/** A `vercel.json` path pattern as a regex: `:path` is a segment, `:path*` any rest. */
export const redirectPattern = (source: string) =>
  new RegExp(
    `^${source
      .replace(/\/$/, '')
      .replaceAll(/[.+?^${}()|[\]\\]/g, '\\$&')
      .replaceAll(/:(\w+)\*/g, '(?<$1>.*)')
      .replaceAll(/:(\w+)/g, '(?<$1>[^/]+)')}$`,
  );

/**
 * Where trpc.io sends `pathname`, following its redirects, or `undefined`
 * when it leaves the site (`/discord`).
 */
export function redirected(
  pathname: string,
  redirects: ReadonlyArray<Redirect>,
): string | undefined {
  let current = pathname.replace(/(.)\/$/, '$1');
  for (let hops = 0; hops < 10; hops++) {
    const redirect = redirects
      .map((candidate) => ({
        candidate,
        match: redirectPattern(candidate.source).exec(current),
      }))
      .find((found) => found.match !== null);
    if (!redirect?.match) {
      return current;
    }
    const groups = redirect.match.groups ?? {};
    const destination = redirect.candidate.destination.replaceAll(
      /:(\w+)\*?/g,
      (_param, name: string) => groups[name] ?? '',
    );
    if (/^[a-z]+:/i.test(destination)) {
      return undefined;
    }
    current = destination.replace(/(.)\/$/, '$1');
  }
  return current;
}

export interface ConvertedPage {
  /** Static files the page shows, by path under `www/`: `static/img/x.svg`. */
  readonly images: ReadonlyArray<string>;
  /** The partials and components it inlines, by path under `www/`. */
  readonly inlined: ReadonlyArray<string>;
  readonly markdown: string;
  /** What couldn't be converted, one message each. */
  readonly problems: ReadonlyArray<string>;
}

const packageManagers = new Set(['bun', 'deno', 'npm', 'pnpm', 'yarn']);

/** Docusaurus admonitions, as GitHub alerts and the title Docusaurus shows. */
const admonitions: Readonly<
  Record<string, { readonly kind: string; readonly title?: string }>
> = {
  caution: { kind: 'WARNING', title: 'Caution' },
  danger: { kind: 'CAUTION', title: 'Danger' },
  info: { kind: 'NOTE', title: 'Info' },
  note: { kind: 'NOTE' },
  tip: { kind: 'TIP' },
  warning: { kind: 'WARNING' },
};

interface Fence {
  /** Index of the opening line. */
  readonly start: number;
  /** Index of the closing line, or the last line if it's never closed. */
  readonly end: number;
  readonly indent: string;
  readonly info: string;
  readonly marker: string;
}

const fenceOpen = /^([ \t]*)(`{3,}|~{3,})(.*)$/;

/** The fenced code blocks among `lines`. */
export function fencesOf(lines: ReadonlyArray<string>): ReadonlyArray<Fence> {
  const fences: Array<Fence> = [];
  let index = 0;
  while (index < lines.length) {
    const open = fenceOpen.exec(lines[index] ?? '');
    const marker = open?.[2];
    if (!open || marker === undefined) {
      index++;
      continue;
    }
    const start = index;
    index++;
    while (index < lines.length) {
      const close = /^[ \t]*(`{3,}|~{3,})[ \t]*$/.exec(lines[index] ?? '');
      if (
        close?.[1] &&
        close[1][0] === marker[0] &&
        close[1].length >= marker.length
      ) {
        break;
      }
      index++;
    }
    fences.push({
      end: Math.min(index, lines.length - 1),
      indent: open[1] ?? '',
      info: (open[3] ?? '').trim(),
      marker,
      start,
    });
    index++;
  }
  return fences;
}

/** For each line, whether it belongs to a fenced code block. */
function inFences(lines: ReadonlyArray<string>) {
  const mask = lines.map(() => false);
  for (const fence of fencesOf(lines)) {
    for (let index = fence.start; index <= fence.end; index++) {
      mask[index] = true;
    }
  }
  return mask;
}

/** Applies `edit` to each run of lines outside code blocks, as one string. */
function editProse(
  lines: ReadonlyArray<string>,
  edit: (prose: string) => string,
): Array<string> {
  const mask = inFences(lines);
  const output: Array<string> = [];
  let run: Array<string> = [];
  const flush = () => {
    if (run.length > 0) {
      output.push(...edit(run.join('\n')).split('\n'));
      run = [];
    }
  };
  for (const [index, line] of lines.entries()) {
    if (mask[index]) {
      flush();
      output.push(line);
    } else {
      run.push(line);
    }
  }
  flush();
  return output;
}

/** `server/procedures` to `client/links` is `../client/links.md`. */
export function relativeLink(fromSlug: string, toSlug: string) {
  const from = fromSlug.split('/').slice(0, -1);
  const to = toSlug.split('/');
  let shared = 0;
  while (
    shared < from.length &&
    shared < to.length - 1 &&
    from[shared] === to[shared]
  ) {
    shared++;
  }
  const up = from.length - shared;
  const rest = to.slice(shared).join('/');
  return `${up === 0 ? './' : '../'.repeat(up)}${rest}.md`;
}

/** Where a link points: a copied page or post, or else trpc.io. */
type Target =
  | {
      readonly kind: 'page';
      readonly slug: string;
      readonly hash: string;
      readonly version: CopiedVersion['id'];
    }
  | { readonly kind: 'post'; readonly slug: string; readonly hash: string }
  | { readonly kind: 'image'; readonly file: string }
  | { readonly kind: 'url'; readonly url: string };

function hashOf(url: URL) {
  return url.hash ? url.hash.slice(1) : '';
}

/**
 * trpc.io's paths this site has a page of its own at, which wins over
 * trpc.io's redirect of the path (its `/sponsor` goes to GitHub Sponsors).
 */
const servedHere: ReadonlySet<string> = new Set(['/sponsor']);

/**
 * Resolves a link as Docusaurus does: a path to an `.md` or `.mdx` file is
 * that file, relative to the linking file (or, from `/`, to the version's
 * docs dir or to `www/`);
 * any other path is a URL, relative to the page's URL on trpc.io, which
 * trpc.io's redirects may send elsewhere. A `/docs/v10/` URL is a v10 page;
 * a `/docs/` one is the linking page's version's, where it has the page.
 * A `/blog/` URL is a post.
 */
export function resolveLink(
  url: string,
  context: {
    /** The file the link is written in, under `www/`. */
    readonly file: string;
    /** The page the link renders on. */
    readonly page: LinkingPage;
    readonly docs: Pick<
      CopiedDocs,
      'pages' | 'posts' | 'redirects' | 'unlisted'
    >;
  },
): Target | undefined {
  if (
    url.startsWith('#') ||
    url === '' ||
    copiedVersions.some((version) => url.startsWith(`${version.imagePath}/`))
  ) {
    return undefined;
  }
  const scheme = /^[a-z][a-z\d+.-]*:/i.test(url);
  const onSite = scheme
    ? /^https?:\/\/(?:www\.)?trpc\.io(?=\/|$)/.exec(url)
    : undefined;
  if (scheme && !onSite) {
    return undefined;
  }
  const local = onSite ? url.slice(onSite[0].length) || '/' : url;
  const pages = context.docs.pages;
  const pathOnly = local.split(/[?#]/)[0] ?? '';
  if (/\.mdx?$/.test(pathOnly)) {
    // A path from `/` is under the version's docs dir, or under `www/`.
    const root = /^(?:versioned_docs\/[^/]+|docs)\//.exec(context.file)?.[0];
    const candidates: ReadonlyArray<readonly [string, string]> =
      local.startsWith('/')
        ? [
            ...(root === undefined
              ? []
              : [[`.${local}`, `file:///${root}`] as const]),
            [local, 'file:///'],
          ]
        : [[local, `file:///${context.file}`]];
    for (const [path, base] of candidates) {
      const target = new URL(path, base);
      const file = decodeURIComponent(target.pathname.slice(1));
      const page = pages.find((candidate) => candidate.file === file);
      if (page) {
        return {
          hash: hashOf(target),
          kind: 'page',
          slug: page.slug,
          version: page.version,
        };
      }
      const post = context.docs.posts.find(
        (candidate) => candidate.file === file,
      );
      if (post) {
        return { hash: hashOf(target), kind: 'post', slug: post.slug };
      }
      const unlisted = context.docs.unlisted.get(file);
      if (unlisted !== undefined) {
        return { kind: 'url', url: `${v11.url}${unlisted}${target.hash}` };
      }
    }
  }
  const from = versionOf(context.page.version);
  const target = new URL(
    local,
    context.page.blog
      ? `${v11.url}/blog/${context.page.slug}`
      : `${v11.url}${from.trpcPath}/${context.page.slug}`,
  );
  const decoded = decodeURIComponent(target.pathname);
  const pageOf = (version: CopiedVersion['id'], slug: string) =>
    pages.find(
      (candidate) => candidate.version === version && candidate.slug === slug,
    );
  // The older versions' docs were written as the current docs, so their
  // `/docs/…` means their own version, which trpc.io serves at
  // `/docs/v10/…` now; its redirects are for the current docs.
  const unversioned =
    /^\/docs(?:\/|$)/.test(decoded) && !/^\/docs\/v\d+(?:\/|$)/.test(decoded);
  const own = unversioned
    ? pageOf(
        context.page.version,
        decoded.replace(/\/$/, '').slice('/docs/'.length) ||
          versionOf(context.page.version).firstDoc,
      )
    : undefined;
  if (own) {
    return {
      hash: hashOf(target),
      kind: 'page',
      slug: own.slug,
      version: own.version,
    };
  }
  if (servedHere.has(decoded.replace(/(.)\/$/, '$1'))) {
    return {
      kind: 'url',
      url: `${target.pathname}${target.search}${target.hash}`,
    };
  }
  const pathname = redirected(decoded, context.docs.redirects) ?? decoded;
  const postSlug = /^\/blog\/([^/]+)$/.exec(pathname)?.[1];
  const post = context.docs.posts.find(
    (candidate) => candidate.slug === postSlug,
  );
  if (post) {
    return { hash: hashOf(target), kind: 'post', slug: post.slug };
  }
  for (const version of byTrpcPath) {
    if (
      pathname !== version.trpcPath &&
      !pathname.startsWith(`${version.trpcPath}/`)
    ) {
      continue;
    }
    const slug =
      pathname.slice(version.trpcPath.length + 1) || version.firstDoc;
    const page =
      (unversioned && version.id === v11.id
        ? pageOf(context.page.version, slug)
        : undefined) ?? pageOf(version.id, slug);
    if (page) {
      return {
        hash: hashOf(target),
        kind: 'page',
        slug: page.slug,
        version: page.version,
      };
    }
    break;
  }
  const image = /^\/img\/([\w.-]+)$/.exec(pathname);
  if (image?.[1]) {
    return { file: `static/img/${image[1]}`, kind: 'image' };
  }
  return {
    kind: 'url',
    url: `${v11.url}${target.pathname}${target.search}${target.hash}`,
  };
}

/** Pages that moved or went away since the docs linked them, and where they are now. */
export const movedLinks: ReadonlyMap<string, string> = new Map([
  [
    'https://planetscale.com/blog/introducing-beam',
    'https://web.archive.org/web/20231214211856/https://planetscale.com/blog/introducing-beam',
  ],
  [
    'https://github.com/planetscale/beam',
    'https://web.archive.org/web/20231212214304/https://github.com/planetscale/beam',
  ],
  [
    'https://github.com/mnik01/viteRPC',
    'https://web.archive.org/web/20241114210459/https://github.com/mnik01/viteRPC',
  ],
  ['http://hilde.gg', 'https://github.com/nehalist/hilde'],
  [
    'https://prisma-editor.bahumaish.app/',
    'https://github.com/mohammed-bahumaish/prisma-editor',
  ],
  ['https://typeschema.com', 'https://github.com/decs/typeschema'],
  [
    'https://common-min-api.proposal.wintercg.org/',
    'https://min-common-api.proposal.wintertc.org/',
  ],
  [
    'https://github.com/Effect-TS/effect/tree/main/packages/schema',
    'https://effect.website/docs/schema/introduction/',
  ],
  [
    'https://github.com/trpc/trpc/tree/main/packages/tests/server/react/polymorphism.test.tsx',
    'https://github.com/trpc/trpc/blob/main/packages/react-query/test/polymorphism.test.tsx',
  ],
  [
    'https://github.com/trpc/trpc/blob/main/packages/client/src/links/httpBatchLink/index.ts',
    'https://github.com/trpc/trpc/blob/v10.45.4/packages/client/src/links/httpBatchLink.ts',
  ],
  [
    'https://github.com/trpc/trpc/blob/feature/output-parser-oas/packages/server/test/outputParser.test.ts',
    'https://github.com/trpc/trpc/blob/v9.27.4/packages/server/test/outputParser.test.ts',
  ],
  [
    'https://vercel.com/docs/serverless-functions/edge-caching',
    'https://vercel.com/docs/edge-cache',
  ],
  ...[
    'prefetching',
    'query-invalidation',
    'query-cancellation',
    'migrating-to-react-query-4',
  ].map(
    (guide) =>
      [
        `https://tanstack.com/query/v4/docs/guides/${guide}`,
        `https://tanstack.com/query/v4/docs/framework/react/guides/${guide}`,
      ] as const,
  ),
]);

const repoMain =
  /^(https:\/\/(?:(?:www\.)?github\.com|githubbox\.com|codesandbox\.io\/s\/github|stackblitz\.com\/github)\/trpc\/trpc\/(?:blob|tree)\/)main\/([^?#]*)/;

/**
 * A link off the site as a copy has it: where it moved, and a link to a
 * file on the repo's `main` at the version's last release, which has it.
 * The older docs meant their own code, which `main` may no longer have.
 */
export function externalUrl(url: string, release: Release | undefined) {
  const file = repoMain.exec(url);
  const path = decodeURIComponent(file?.[2] ?? '').replace(/\/$/, '');
  const pinned =
    file && release?.paths.has(path)
      ? `${file[1]}${release.tag}/${url.slice(`${file[1]}main/`.length)}`
      : url;
  return movedLinks.get(pinned) ?? pinned;
}

function imageUrl(file: string, version: CopiedVersion) {
  return `${version.imagePath}/${file.split('/').at(-1) ?? file}`;
}

/** Parses JSX attributes: `value="zod" default style={{ width: '100%' }}`. */
function attributesOf(source: string) {
  const attributes = new Map<string, string | true>();
  for (const match of source.matchAll(
    /([\w-]+)(?:=(?:"([^"]*)"|'([^']*)'|\{\{([^}]*)\}\}|\{([^}]*)\}))?/g,
  )) {
    const name = match[1];
    if (!name) {
      continue;
    }
    const value = match[2] ?? match[3] ?? match[4] ?? match[5];
    attributes.set(
      name,
      value === undefined
        ? true
        : match[4] === undefined
          ? value
          : `{{${value}}}`,
    );
  }
  return attributes;
}

/** `{ marginBottom: '12px', flex: 1 }` as CSS: `margin-bottom: 12px; flex: 1px`. */
export function styleOf(object: string) {
  return Array.from(
    object.matchAll(/(\w+)\s*:\s*(?:'([^']*)'|"([^"]*)"|(-?[\d.]+)(?![\w%]))/g),
    (match) => {
      const property = (match[1] ?? '').replaceAll(
        /[A-Z]/g,
        (letter) => `-${letter.toLowerCase()}`,
      );
      const number = match[4];
      const value =
        number === undefined
          ? (match[2] ?? match[3] ?? '')
          : number === '0'
            ? '0'
            : `${number}px`;
      return `${property}: ${value}`;
    },
  ).join('; ');
}

/** JSX that is static HTML apart from its spelling (`className`, `style={{}}`, `{' '}`) as HTML. */
export function jsxToHtml(jsx: string) {
  return jsx
    .replaceAll(/\{\s*(['"])\s\1\s*\}/g, ' ')
    .replaceAll(/\bclassName=/g, 'class=')
    .replaceAll(
      /\bstyle=\{\{([^}]*)\}\}/g,
      (_style, object: string) => `style="${styleOf(object)}"`,
    );
}

/** A component without props that returns static JSX, as HTML. */
function inlineComponent(source: string) {
  const body =
    /\(\s*\)\s*(?:=>|\{)[\s\S]*?return\s*\(\s*([\s\S]*?)\s*\);\s*\n\}/.exec(
      source,
    )?.[1];
  if (body === undefined) {
    return undefined;
  }
  const html = jsxToHtml(body)
    .split('\n')
    .filter((line) => line.trim() !== '')
    .join('\n');
  return /=\{|\{[^}]*\}/.test(html) ? undefined : html;
}

/** A Twoslash block with its `// @include:` lines replaced by the `twoslash include` blocks they name. */
export function expandIncludes(
  code: string,
  includes: ReadonlyMap<string, string>,
  problems: Array<string>,
) {
  let expanded = code;
  for (let depth = 0; depth < 5; depth++) {
    expanded = expanded.replaceAll(
      /^[ \t]*\/\/ @include: (\S+)[ \t]*$/gm,
      (line, name: string) => {
        const included = includes.get(name);
        if (included === undefined) {
          problems.push(`\`${line.trim()}\`: no \`twoslash include ${name}\``);
          return '';
        }
        return included.replace(/\n$/, '');
      },
    );
  }
  return trimBlankLines(expanded.split('\n')).join('\n');
}

function trimBlankLines(lines: Array<string>) {
  while (lines[0]?.trim() === '') {
    lines.shift();
  }
  while (lines.at(-1)?.trim() === '') {
    lines.pop();
  }
  return lines;
}

/**
 * A `// ^?` above the last `// ---cut---` queries code that isn't shown,
 * which trpc.io's Twoslash ignored and this site's rejects; it goes.
 */
function withoutHiddenQueries(code: string) {
  const lines = code.split('\n');
  const cut = lines.findLastIndex((line) =>
    /^[ \t]*\/\/ ---cut(?:-before)?---[ \t]*$/.test(line),
  );
  return lines
    .filter((line, index) => index > cut || !/^[ \t]*\/\/\s*\^[?|]/.test(line))
    .join('\n');
}

/** Plain code for a Twoslash block: what trpc.io shows of it. */
export function plainCode(
  code: string,
  includes: ReadonlyMap<string, string>,
  problems: Array<string>,
) {
  const lines = removeTwoslashNotations(
    expandIncludes(code, includes, problems),
  )
    .split('\n')
    .filter((line) => !/^[ \t]*\/\/ @(?:filename|include): /.test(line));
  return trimBlankLines(lines).join('\n');
}

/** A fence's info, without `twoslash`, its language in lowercase and its title in double quotes. */
function plainInfo(info: string) {
  const lang = (/^[\w-]*/.exec(info)?.[0] ?? '').toLowerCase();
  const title = /\btitle\s*=\s*(["'])(.*?)\1/.exec(info)?.[2];
  return `${lang}${title === undefined ? '' : ` title="${title}"`}`;
}

interface PageContext {
  readonly docs: CopiedDocs;
  /** The file being converted: the page, or a partial it includes. */
  readonly file: string;
  readonly images: Set<string>;
  readonly inlined: Set<string>;
  /** The page the result renders on, which its links are relative to. */
  readonly page: LinkingPage;
  readonly problems: Array<string>;
  /** Whether Twoslash blocks stay Twoslash blocks (v11's), or become plain code. */
  readonly twoslash: boolean;
}

/**
 * A link to a page of the same version is a relative `.md` link in
 * Markdown, which the build checks; one to another version, or from a
 * post, is that page's path on this site.
 */
function rewriteUrl(url: string, context: PageContext, html: boolean) {
  const target = resolveLink(url, context);
  if (!target) {
    return url;
  }
  if (target.kind === 'post') {
    return `/blog/${target.slug}${target.hash ? `#${target.hash}` : ''}`;
  }
  if (target.kind === 'image') {
    context.images.add(target.file);
    return imageUrl(target.file, versionOf(context.page.version));
  }
  if (target.kind === 'url') {
    if (/\.mdx?(?:[?#]|$)/.test(target.url)) {
      context.problems.push(
        `${context.file}: ${url} isn't a page of the sidebar`,
      );
    }
    return target.url;
  }
  const hash = target.hash ? `#${target.hash}` : '';
  if (html || context.page.blog || target.version !== context.page.version) {
    return `${versionOf(target.version).basePath}/${target.slug}${hash}`;
  }
  return `${relativeLink(context.page.slug, target.slug)}${hash}`;
}

/** Resolves an import's specifier to a path under `www/`, or a `@theme/` or package name. */
function resolveImport(specifier: string, from: string) {
  if (specifier.startsWith('@site/')) {
    return specifier.slice('@site/'.length);
  }
  if (!specifier.startsWith('.') && !specifier.startsWith('/')) {
    return specifier;
  }
  return new URL(specifier, `file:///${from}`).pathname.slice(1);
}

const inlineCode = /(`+)(?!`)(?:(?!\1)[^\n])+?\1(?!`)/g;

/** Replaces the inline code in `prose` while `edit` runs, so it stays as written. */
function keepingInlineCode(prose: string, edit: (masked: string) => string) {
  const spans: Array<string> = [];
  const masked = prose.replaceAll(inlineCode, (span) => {
    spans.push(span);
    return `\uE000${spans.length - 1}\uE000`;
  });
  return edit(masked).replaceAll(
    /\uE000(\d+)\uE000/g,
    (_marker, index: string) => spans[Number(index)] ?? '',
  );
}

interface Converting extends PageContext {
  readonly imports: Map<string, string>;
  readonly includes: Map<string, string>;
  /** Partials to splice in at the end, by their marker's number. */
  readonly partials: Array<string>;
}

function takeImports(lines: ReadonlyArray<string>, context: Converting) {
  const mask = inFences(lines);
  return lines.filter((line, index) => {
    if (mask[index]) {
      return true;
    }
    if (/^export\s/.test(line)) {
      context.problems.push(`${context.file}: \`${line}\``);
      return false;
    }
    if (!/^import\s/.test(line)) {
      return true;
    }
    const match =
      /^import\s+(?:(\w+)|\{\s*(\w+)\s*\})\s+from\s+['"]([^'"]+)['"];?\s*$/.exec(
        line,
      );
    const name = match?.[1] ?? match?.[2];
    if (!match?.[3] || !name) {
      context.problems.push(`${context.file}: \`${line}\``);
      return false;
    }
    context.imports.set(name, resolveImport(match[3], context.file));
    return false;
  });
}

function takeIncludes(lines: ReadonlyArray<string>, context: Converting) {
  const drop = new Set<number>();
  for (const fence of fencesOf(lines)) {
    const name = /^twoslash include (\S+)/.exec(fence.info)?.[1];
    if (!name) {
      continue;
    }
    context.includes.set(
      name,
      lines.slice(fence.start + 1, fence.end).join('\n'),
    );
    for (let index = fence.start; index <= fence.end; index++) {
      drop.add(index);
    }
    if (lines[fence.end + 1]?.trim() === '') {
      drop.add(fence.end + 1);
    }
  }
  return lines.filter((_line, index) => !drop.has(index));
}

function convertFences(lines: ReadonlyArray<string>, context: Converting) {
  const output = [...lines];
  for (const fence of fencesOf(lines).toReversed()) {
    const twoslash = /\btwoslash\b/.test(fence.info);
    const info = plainInfo(fence.info);
    const opening = `${fence.indent}${fence.marker}${info}`;
    if (!twoslash) {
      output[fence.start] = opening;
      continue;
    }
    const body = lines
      .slice(fence.start + 1, fence.end)
      .map((line) =>
        line.startsWith(fence.indent) ? line.slice(fence.indent.length) : line,
      )
      .join('\n');
    const problems: Array<string> = [];
    const code = context.twoslash
      ? withoutHiddenQueries(expandIncludes(body, context.includes, problems))
      : plainCode(body, context.includes, problems);
    context.problems.push(
      ...problems.map((problem) => `${context.file}: ${problem}`),
    );
    output.splice(
      fence.start,
      fence.end - fence.start + 1,
      context.twoslash
        ? `${fence.indent}${fence.marker}${info.replace(/^[\w-]*/, (lang) => `${lang} twoslash`)}`
        : opening,
      ...code
        .split('\n')
        .map((line) => (line === '' ? '' : `${fence.indent}${line}`)),
      `${fence.indent}${fence.marker}`,
    );
  }
  return output;
}

function youTubeEmbed(attributes: ReadonlyMap<string, string | true>) {
  const id = attributes.get('videoId');
  const title = attributes.get('title');
  if (typeof id !== 'string' || typeof title !== 'string') {
    return undefined;
  }
  return `<iframe src="https://www.youtube-nocookie.com/embed/${id}" title="${title}" style="aspect-ratio: 16 / 9; width: 100%; max-width: 42rem; border: 0" loading="lazy" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" allowfullscreen></iframe>`;
}

/**
 * `` `https://stackblitz.com/…?` + searchParams({ embed: '1', file: ['a.ts'] }) ``
 * as the URL it builds (`src/utils/searchParams.ts`): each value, or each
 * of an array's, as `key=value`.
 */
export function searchParamsUrl(expression: string) {
  const call = /^`([^`$]*)`\s*\+\s*searchParams\(\s*\{([\s\S]*)\}\s*\)$/.exec(
    expression.trim(),
  );
  if (!call) {
    return undefined;
  }
  const object = (call[2] ?? '').replaceAll(/\/\/[^\n]*/g, '');
  const entry = /(\w+)\s*:\s*(\[[^\]]*\]|'[^']*'|"[^"]*")/g;
  if (object.replaceAll(entry, '').replaceAll(/[\s,]/g, '') !== '') {
    return undefined;
  }
  const params = Array.from(object.matchAll(entry), (match) =>
    Array.from(
      (match[2] ?? '').matchAll(/'([^']*)'|"([^"]*)"/g),
      (value) =>
        `${match[1]}=${encodeURIComponent(value[1] ?? value[2] ?? '')}`,
    ),
  ).flat();
  return `${call[1]}${params.join('&')}`;
}

const staticTweetAttribute =
  /\s+([\w-]+)=(?:"([^"]*)"|\{\s*('(?:\\.|[^'\\])*'|"(?:\\.|[^"\\])*")\s*\})/g;
const staticTweet = new RegExp(
  `<StaticTweet((?:${staticTweetAttribute.source})*)\\s*/>`,
  'g',
);

/** A JS string literal's value: `'a\nb'` is two lines. Escapes other than `\n`, `\\` and quotes aren't. */
function stringLiteralValue(literal: string) {
  let unknown = false;
  const value = literal
    .slice(1, -1)
    .replaceAll(/\\(.)/g, (_escape, character: string) => {
      if (character === 'n') {
        return '\n';
      }
      unknown ||= !`\\'"`.includes(character);
      return character;
    });
  return unknown ? undefined : value;
}

function escapeHtml(text: string) {
  return text
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

const staticTweetProps = [
  'id',
  'name',
  'username',
  'avatarUrl',
  'text',
  'createdAt',
] as const;

const months = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
];

/** `9:41 AM · Feb 10, 2024`, in UTC, as trpc.io's `StaticTweet` shows it. */
export function tweetTimestamp(date: Date) {
  const hours = date.getUTCHours();
  const minutes = String(date.getUTCMinutes()).padStart(2, '0');
  const time = `${hours % 12 || 12}:${minutes} ${hours < 12 ? 'AM' : 'PM'}`;
  return `${time} · ${months[date.getUTCMonth()]} ${date.getUTCDate()}, ${date.getUTCFullYear()}`;
}

/** Twitter's bird, as its embedded tweets show it. */
const twitterBird =
  '<svg class="tweet-bird" viewBox="0 0 24 24" aria-hidden="true"><path d="M23.643 4.937c-.835.37-1.732.62-2.675.733.962-.576 1.7-1.49 2.048-2.578-.9.534-1.897.922-2.958 1.13-.85-.904-2.06-1.47-3.4-1.47-2.572 0-4.658 2.086-4.658 4.66 0 .364.042.718.12 1.06-3.873-.195-7.304-2.05-9.602-4.868-.4.69-.63 1.49-.63 2.342 0 1.616.823 3.043 2.072 3.878-.764-.025-1.482-.234-2.11-.583v.06c0 2.257 1.605 4.14 3.737 4.568-.392.106-.803.162-1.227.162-.3 0-.593-.028-.877-.082.593 1.85 2.313 3.198 4.352 3.234-1.595 1.25-3.604 1.995-5.786 1.995-.376 0-.747-.022-1.112-.065 2.062 1.323 4.51 2.093 7.14 2.093 8.57 0 13.255-7.098 13.255-13.254 0-.2-.005-.402-.014-.602.91-.658 1.7-1.477 2.323-2.41z" /></svg>';

/**
 * A `<StaticTweet>` (trpc.io's copy of a tweet, `src/components/StaticTweet.tsx`)
 * as the same card in HTML, styled like Twitter's embedded tweets by
 * `.tweet`: the author links to their profile, URLs, @mentions and
 * #hashtags in the text are links, and the timestamp and "Read more on
 * Twitter" link to the tweet, deleted or not. `archiveUrl` is an "Archived
 * copy" link beside the timestamp.
 */
function staticTweetOf(tag: string, attributes: string, context: Converting) {
  const problem = (why: string) => {
    context.problems.push(
      `${context.file}: \`${tag.split('\n')[0]?.trim()}\`: ${why}`,
    );
    return '';
  };
  if (context.imports.get('StaticTweet') !== 'src/components/StaticTweet') {
    return problem("isn't trpc.io's StaticTweet");
  }
  const props = new Map<string, string>();
  for (const match of attributes.matchAll(staticTweetAttribute)) {
    const value = match[2] ?? stringLiteralValue(match[3] ?? '');
    if (value === undefined) {
      return problem(`no conversion for \`${match[1]}\`'s escapes`);
    }
    props.set(match[1] ?? '', value);
  }
  const known = new Set<string>([...staticTweetProps, 'archiveUrl']);
  const wrong = [
    ...[...props.keys()]
      .filter((name) => !known.has(name))
      .map((name) => `no conversion for \`${name}\``),
    ...staticTweetProps
      .filter((name) => !props.has(name))
      .map((name) => `no \`${name}\``),
  ];
  if (wrong.length > 0) {
    return problem(wrong.join(', '));
  }
  const id = props.get('id') ?? '';
  const username = props.get('username') ?? '';
  if (!/^\d+$/.test(id) || !/^\w+$/.test(username)) {
    return problem('`id` is no tweet id, or `username` no handle');
  }
  const date = new Date(props.get('createdAt') ?? '');
  if (Number.isNaN(date.getTime())) {
    return problem('`createdAt` is no date');
  }
  const profileUrl = `https://twitter.com/${username}`;
  const tweetUrl = `${profileUrl}/status/${id}`;
  const archiveUrl = props.get('archiveUrl');
  const text = (props.get('text') ?? '')
    .split(/(https?:\/\/\S+|(?<!\w)@\w+|(?<!\w)#\w*[a-z_]\w*)/i)
    .map((part, index) => {
      if (index % 2 === 0) {
        return escapeHtml(part);
      }
      const href = part.startsWith('@')
        ? `https://twitter.com/${part.slice(1)}`
        : part.startsWith('#')
          ? `https://twitter.com/hashtag/${part.slice(1)}`
          : part;
      return `<a href="${escapeHtml(href)}">${escapeHtml(part.replace(/^https?:\/\//, ''))}</a>`;
    })
    .join('')
    .replaceAll('\n', '<br />');
  return [
    '',
    '<figure class="tweet">',
    `<div class="tweet-header"><a class="tweet-author" href="${profileUrl}"><img class="tweet-avatar" src="${escapeHtml(props.get('avatarUrl') ?? '')}" alt="" width="48" height="48" loading="lazy" /><span class="tweet-author-names"><span class="tweet-name">${escapeHtml(props.get('name') ?? '')}</span><span class="tweet-username">@${username}</span></span></a>${twitterBird}</div>`,
    `<blockquote class="tweet-text" cite="${tweetUrl}">${text}</blockquote>`,
    `<div class="tweet-meta"><a href="${tweetUrl}"><time datetime="${date.toJSON()}">${tweetTimestamp(date)}</time></a>${
      archiveUrl === undefined
        ? ''
        : `<span aria-hidden="true"> · </span><a class="tweet-archive" href="${escapeHtml(archiveUrl)}">Archived copy</a>`
    }</div>`,
    `<div class="tweet-footer"><a href="${tweetUrl}">Read more on Twitter</a></div>`,
    '</figure>',
    '',
  ].join('\n');
}

/**
 * The StackBlitz embed of v10's quickstart: an `<Iframe>` filling a
 * `<div>` 800px high, as one iframe. `<StaticTweet>`s, alone or in the
 * `<div>` that lays them out, are cards.
 */
function convertEmbeds(lines: ReadonlyArray<string>, context: Converting) {
  return editProse(lines, (prose) =>
    prose
      .replaceAll(
        new RegExp(
          `<div\\b[^>]*>\\s*((?:${staticTweet.source}\\s*)+)</div>`,
          'g',
        ),
        (_div, tweets: string) => tweets,
      )
      .replaceAll(staticTweet, (tag, attributes: string) =>
        staticTweetOf(tag, attributes, context),
      )
      .replaceAll(
        /<div\s+className=\{clsx\(\s*(['"])([^'"]*)\1,?\s*\)\}\s*>\s*<Iframe\s+src=\{([\s\S]*?)\}\s*(?:[\w-]+="[^"]*"\s*)*\/>\s*<\/div>/g,
        (embed, _quote, classes: string, src: string) => {
          const url = searchParamsUrl(src);
          if (
            context.imports.get('Iframe') !== 'src/components/Iframe' ||
            !classes.includes('h-[800px]') ||
            url === undefined
          ) {
            context.problems.push(
              `${context.file}: no conversion for \`${embed.split('\n')[0]}\``,
            );
            return embed;
          }
          return `<iframe src="${url}" title="StackBlitz" style="width: 100%; height: 800px; border: 0; border-radius: 0.75rem" loading="lazy"></iframe>`;
        },
      ),
  );
}

/** A self-closing component, as Markdown or HTML. */
function expandComponent(
  tag: string,
  name: string,
  attributes: ReadonlyMap<string, string | true>,
  context: Converting,
) {
  const source = context.imports.get(name);
  const problem = (why: string) => {
    context.problems.push(`${context.file}: \`${tag.trim()}\`: ${why}`);
    return tag;
  };
  if (source === undefined) {
    return problem('not imported');
  }
  if (source.endsWith('/InstallSnippet')) {
    const packages = attributes.get('pkgs');
    return typeof packages === 'string'
      ? `\n\`\`\`package-install\n${packages}\n\`\`\`\n`
      : problem('no `pkgs`');
  }
  if (source.endsWith('/YouTubeEmbed')) {
    return youTubeEmbed(attributes) ?? problem('no `videoId` or `title`');
  }
  if (source.endsWith('.svg')) {
    context.images.add(source);
    const style = attributes.get('style');
    return `<img src="${imageUrl(source, versionOf(context.page.version))}" alt=""${
      typeof style === 'string' && style.startsWith('{{')
        ? ` style="${styleOf(style)}"`
        : ''
    } />`;
  }
  if (source.endsWith('.mdx')) {
    if (!context.docs.files.has(source)) {
      return problem(`${source} isn't there`);
    }
    context.inlined.add(source);
    context.partials.push(source);
    return `\n\uE001${context.partials.length - 1}\uE001\n`;
  }
  if (source.startsWith('src/components/')) {
    const component = context.docs.files.get(`${source}.tsx`);
    const html =
      attributes.size === 0 && component !== undefined
        ? inlineComponent(component)
        : undefined;
    if (html === undefined) {
      return problem(
        'only components without props that return static JSX inline',
      );
    }
    context.inlined.add(`${source}.tsx`);
    return `\n${html}\n`;
  }
  return problem(`no conversion for ${source}`);
}

/** `text` without `pattern`'s matches, removed again until none are left. */
export function removeAll(text: string, pattern: RegExp) {
  let previous: string;
  let current = text;
  do {
    previous = current;
    current = current.replace(pattern, '');
  } while (current !== previous);
  return current;
}

function convertProse(lines: ReadonlyArray<string>, context: Converting) {
  return editProse(lines, (prose) =>
    keepingInlineCode(prose, (masked) => {
      const converted = removeAll(
        removeAll(masked, /<head>[\s\S]*?<\/head>\n?/g),
        /[ \t]*<script\b[\s\S]*?<\/script[^>]*>/gi,
      )
        .replaceAll(/\{\/\*[\s\S]*?\*\/\}\n?/g, '')
        .replaceAll(
          /<([A-Z][\w.]*)((?:\s+[\w-]+(?:=(?:"[^"]*"|'[^']*'|\{\{[^}]*\}\}|\{[^}]*\}))?)*)\s*\/>/g,
          (tag, name: string, attributes: string) =>
            expandComponent(tag, name, attributesOf(attributes), context),
        )
        .replaceAll(/<[a-z][\w-]*\b[^>]*>/g, jsxToHtml)
        .replaceAll(/\{\s*(['"])\s\1\s*\}/g, ' ')
        .replaceAll(
          /\b(href|src)="([^"]*)"/g,
          (_attribute, name: string, url: string) =>
            `${name}="${rewriteUrl(url, context, true)}"`,
        )
        .replaceAll(
          /\]\(([^)\s]+)((?:\s+"[^"]*")?)\)/g,
          (_link, url: string, title: string) =>
            `](${rewriteUrl(url, context, false)}${title})`,
        )
        .replaceAll(/^<\/?p>[ \t]*$/gm, '')
        // Link targets, and the bare URLs GitHub's Markdown links.
        .replaceAll(
          /https?:\/\/[^\s<>"'`)\]|\uE000]+?(?=[.,;:!?*]*(?:[\s<>"'`)\]|\uE000]|$))/g,
          (url) =>
            externalUrl(url, context.docs.releases.get(context.page.version)),
        );
      for (const match of converted.matchAll(/<\/?([A-Z][\w.]*)/g)) {
        if (match[1] !== 'Tabs' && match[1] !== 'TabItem') {
          context.problems.push(
            `${context.file}: no conversion for <${match[1]}>`,
          );
        }
      }
      for (const match of converted.matchAll(/<[a-z][\w-]*\b[^>]*=\{[^>]*>/g)) {
        context.problems.push(
          `${context.file}: a JSX expression in \`${match[0]}\``,
        );
      }
      return converted;
    }),
  );
}

function slugOfLabel(label: string) {
  return label
    .toLowerCase()
    .replaceAll(/[^a-z\d]+/g, '-')
    .replaceAll(/^-|-$/g, '');
}

/**
 * `<Tabs>` of `<TabItem>`s become a tab group (`rehypeCodeTabs`): a panel
 * per tab, with its Markdown. Groups of package managers switch with the
 * install commands.
 */
function convertTabs(lines: ReadonlyArray<string>, context: Converting) {
  const output: Array<string> = [];
  const mask = inFences(lines);
  let index = 0;
  while (index < lines.length) {
    const line = lines[index] ?? '';
    const open = mask[index] ? null : /^\s*<Tabs\b([^>]*)>\s*$/.exec(line);
    if (!open) {
      output.push(line);
      index++;
      continue;
    }
    const groupId = attributesOf(open[1] ?? '').get('groupId');
    const items: Array<{
      readonly active: boolean;
      readonly label: string;
      readonly lines: Array<string>;
    }> = [];
    let current: Array<string> | undefined;
    index++;
    for (; index < lines.length; index++) {
      const inner = lines[index] ?? '';
      if (mask[index]) {
        current?.push(inner);
        continue;
      }
      if (/^\s*<\/Tabs>\s*$/.test(inner)) {
        break;
      }
      const item = /^\s*<TabItem\b([^>]*)>\s*$/.exec(inner);
      if (item) {
        const attributes = attributesOf(item[1] ?? '');
        const value = attributes.get('value');
        const label = attributes.get('label') ?? value;
        if (typeof label !== 'string') {
          context.problems.push(
            `${context.file}: \`${inner.trim()}\` has no label`,
          );
        }
        current = [];
        items.push({
          active: attributes.get('default') === true,
          label: typeof label === 'string' ? label : `Tab ${items.length + 1}`,
          lines: current,
        });
        continue;
      }
      if (/^\s*<\/TabItem>\s*$/.test(inner)) {
        current = undefined;
        continue;
      }
      if (current) {
        current.push(inner.trimStart());
      } else if (inner.trim() !== '') {
        context.problems.push(
          `${context.file}: \`${inner.trim()}\` outside a <TabItem>`,
        );
      }
    }
    index++;
    const labels = items.map((item) => item.label);
    const group =
      typeof groupId === 'string'
        ? groupId
        : labels.every((label) => packageManagers.has(label))
          ? 'package-manager'
          : `tabs-${labels.map(slugOfLabel).join('-')}`;
    output.push(`<div class="code-tabs" data-tabs="${group}">`);
    for (const item of items) {
      const body = item.lines;
      while (body[0]?.trim() === '') {
        body.shift();
      }
      while (body.at(-1)?.trim() === '') {
        body.pop();
      }
      output.push(
        `<div data-tab="${item.label}"${item.active ? ' data-active' : ''}>`,
        '',
        ...body,
        '',
        '</div>',
      );
    }
    output.push('</div>');
  }
  return output;
}

/** `:::tip Title` … `:::` becomes `> [!TIP] Title` and the lines quoted. */
function convertAdmonitions(lines: ReadonlyArray<string>, context: Converting) {
  const output: Array<string> = [];
  const mask = inFences(lines);
  let open: { readonly indent: string; readonly name: string } | undefined;
  for (const [index, line] of lines.entries()) {
    const fenced = mask[index];
    const start = fenced
      ? null
      : /^([ \t]*):::(\w+)(?:[ \t]+(.*))?$/.exec(line);
    // `:::tip` in an open tip is a typo for `:::`: Docusaurus nests the rest
    // of the page in it.
    const reopened =
      open !== undefined && start?.[2] === open.name && !start[3]?.trim();
    if (start && !reopened) {
      const admonition = admonitions[start[2] ?? ''];
      if (open || !admonition) {
        context.problems.push(`${context.file}: \`${line.trim()}\``);
        output.push(line);
        continue;
      }
      const title = start[3]?.trim() || admonition.title;
      open = { indent: start[1] ?? '', name: start[2] ?? '' };
      // An alert is a block of its own, as an admonition is in MDX: a line
      // of HTML right above it would otherwise swallow it.
      if ((output.at(-1) ?? '').trim() !== '') {
        output.push('');
      }
      output.push(
        `${open.indent}> [!${admonition.kind}]${title ? ` ${title}` : ''}`,
      );
      continue;
    }
    if (!open) {
      output.push(line);
      continue;
    }
    if (reopened || (!fenced && /^[ \t]*:::[ \t]*$/.test(line))) {
      while (output.at(-1) === `${open.indent}>`) {
        output.pop();
      }
      output.push('');
      open = undefined;
      continue;
    }
    const inner = line.startsWith(open.indent)
      ? line.slice(open.indent.length)
      : line.trimStart();
    output.push(
      inner.trim() === '' ? `${open.indent}>` : `${open.indent}> ${inner}`,
    );
  }
  if (open) {
    context.problems.push(`${context.file}: an admonition isn't closed`);
  }
  return output;
}

/** Squeezes runs of blank lines outside code blocks into one. */
function squeezeBlankLines(lines: ReadonlyArray<string>) {
  const mask = inFences(lines);
  return lines.filter(
    (line, index) =>
      mask[index] ||
      line.trim() !== '' ||
      (index > 0 && lines[index - 1]?.trim() !== ''),
  );
}

/**
 * Drops HTML comments, which show nothing. A comment is a block of its own
 * up to the line that closes it, so a fence it comments out is no fence.
 */
function dropComments(lines: ReadonlyArray<string>) {
  const output: Array<string> = [];
  let fence: string | undefined;
  let comment = false;
  for (const line of lines) {
    if (comment) {
      const end = line.indexOf('-->');
      if (end !== -1) {
        comment = false;
        const rest = line.slice(end + '-->'.length);
        if (rest.trim() !== '') {
          output.push(rest);
        }
      }
      continue;
    }
    if (fence !== undefined) {
      output.push(line);
      const close = /^[ \t]*(`{3,}|~{3,})[ \t]*$/.exec(line)?.[1];
      if (
        close !== undefined &&
        close[0] === fence[0] &&
        close.length >= fence.length
      ) {
        fence = undefined;
      }
      continue;
    }
    const start = /^ {0,3}<!--/.exec(line);
    if (start) {
      const end = line.indexOf('-->', start[0].length);
      if (end === -1) {
        comment = true;
      } else if (line.slice(end + '-->'.length).trim() !== '') {
        output.push(line.slice(end + '-->'.length));
      }
      continue;
    }
    fence = fenceOpen.exec(line)?.[2];
    output.push(line);
  }
  return output;
}

function stripFrontmatter(raw: string) {
  return raw.replace(/^---\n[\s\S]*?\n---\n/, '');
}

function convertBody(source: string, context: PageContext): string {
  const converting: Converting = {
    ...context,
    imports: new Map(),
    includes: new Map(),
    partials: [],
  };
  let lines = dropComments(
    stripFrontmatter(source).replaceAll('\r\n', '\n').split('\n'),
  );
  lines = takeImports(lines, converting);
  lines = takeIncludes(lines, converting);
  lines = convertFences(lines, converting);
  lines = convertEmbeds(lines, converting);
  lines = convertProse(lines, converting);
  lines = convertTabs(lines, converting);
  lines = convertAdmonitions(lines, converting);
  const body = lines
    .join('\n')
    .replaceAll(/\uE001(\d+)\uE001/g, (_marker, index: string) => {
      const file = converting.partials[Number(index)] ?? '';
      return convertBody(context.docs.files.get(file) ?? '', {
        ...context,
        file,
      }).trim();
    });
  return body;
}

function yamlString(value: string) {
  return JSON.stringify(value);
}

/**
 * Converts the file the page or post at `page` renders, and lays out the
 * result under the frontmatter `frontmatterOf` writes from its lines.
 */
function convertFile(
  file: string,
  page: LinkingPage,
  twoslash: boolean,
  docs: CopiedDocs,
  frontmatterOf:
    | ((
        lines: ReadonlyArray<string>,
        problems: Array<string>,
      ) => ReadonlyArray<string>)
    | undefined,
): ConvertedPage {
  const images = new Set<string>();
  const inlined = new Set<string>();
  const problems: Array<string> = [];
  const source = docs.files.get(file);
  if (source === undefined) {
    return {
      images: [],
      inlined: [],
      markdown: '',
      problems: [`${file} isn't there`],
    };
  }
  const body = convertBody(source, {
    docs,
    file,
    images,
    inlined,
    page,
    problems,
    twoslash,
  });
  const lines = squeezeBlankLines(body.split('\n'));
  while (lines[0]?.trim() === '') {
    lines.shift();
  }
  for (const line of twoslash ? [] : lines) {
    if (/^[ \t>]*(?:`{3,}|~{3,})[^\n]*\btwoslash\b/.test(line)) {
      problems.push(`${file}: a Twoslash block is left in \`${line}\``);
    }
  }
  const frontmatter =
    frontmatterOf === undefined
      ? []
      : ['---', ...frontmatterOf(lines, problems), '---', ''];
  return {
    images: [...images].toSorted(),
    inlined: [...inlined].toSorted(),
    markdown: `${[...frontmatter, ...lines].join('\n').trimEnd()}\n`,
    problems,
  };
}

/**
 * A file trpc.io shows outside its docs, as Markdown without frontmatter:
 * the code of its home page's intro (`src/components/QuickIntro.tsx`).
 * Links in it are paths on this site, as a post's are.
 */
export function convertSnippet(file: string, docs: CopiedDocs): ConvertedPage {
  return convertFile(
    file,
    { blog: true, slug: 'index', version: v11.id },
    true,
    docs,
    undefined,
  );
}

/** A copied page as a page of this site: its frontmatter and Markdown. */
export function convertPage(page: CopiedPage, docs: CopiedDocs): ConvertedPage {
  return convertFile(page.file, page, page.version === v11.id, docs, () => [
    `title: ${yamlString(page.title)}`,
    ...(page.label === undefined || page.label === page.title
      ? []
      : [`label: ${yamlString(page.label)}`]),
    `description: ${yamlString(page.description)}`,
    `section: ${yamlString(page.section)}`,
    ...(page.parent === undefined
      ? []
      : [`parent: ${yamlString(page.parent)}`]),
    `order: ${page.order}`,
  ]);
}

/** Markdown as the text it reads as: without links' targets, emphasis or HTML. */
export function plainProse(markdown: string) {
  return removeAll(
    markdown
      .replaceAll(/!\[[^\]]*\]\([^)]*\)/g, '')
      .replaceAll(/\[([^\]]*)\]\([^)]*\)/g, '$1'),
    /<[^>]*>/g,
  )
    .replaceAll('<', '')
    .replaceAll(/(?<!\w)(\*\*|__|\*|_|`)(\S(?:[^\n]*?\S)?)\1(?!\w)/g, '$2')
    .replaceAll(/\s+/g, ' ')
    .trim();
}

/**
 * A copied post as a post of this site. Its description is its first
 * paragraph, which trpc.io's blog shows of it above its `truncate`.
 */
export function convertPost(post: CopiedPost, docs: CopiedDocs): ConvertedPage {
  return convertFile(
    post.file,
    { blog: true, slug: post.slug, version: v11.id },
    true,
    docs,
    (lines, problems) => {
      const end = lines.findIndex((line) => line.trim() === '');
      const paragraph = lines.slice(0, end === -1 ? undefined : end);
      if (/^\s*(?:[#>|<]|`{3}|~{3}|[-*+] |\d+\. )/.test(paragraph[0] ?? '#')) {
        problems.push(`${post.file}: doesn't open with a paragraph`);
      }
      return [
        `title: ${yamlString(post.title)}`,
        `description: ${yamlString(plainProse(paragraph.join('\n')))}`,
        `date: ${yamlString(post.date)}`,
        `authors: ${JSON.stringify(
          post.authors.map((author) => ({
            image: author.image,
            name: author.name,
            title: author.title,
            url: author.url,
          })),
        )}`,
        ...(post.discussion === undefined
          ? []
          : [`discussion: ${post.discussion}`]),
      ];
    },
  );
}

/**
 * Drops the `#hash` of each link to a page that has no such heading, so the
 * build's link check passes; Docusaurus only warns about these. `anchors`
 * holds each page's heading ids by `<version>:<slug>`; links between
 * versions are paths on this site, in Markdown or HTML.
 */
export function dropMissingAnchors(
  markdown: string,
  page: Pick<CopiedPage, 'slug' | 'version'>,
  anchors: ReadonlyMap<string, ReadonlySet<string>>,
) {
  const dropped: Array<string> = [];
  const keep = (
    version: CopiedVersion['id'],
    slug: string | undefined,
    hash: string,
  ) => {
    const ids =
      slug === undefined ? undefined : anchors.get(`${version}:${slug}`);
    return !ids || ids.has(decodeURIComponent(hash));
  };
  const onSite = (path: string) => {
    const version = copiedVersions.find((candidate) =>
      path.startsWith(`${candidate.basePath}/`),
    );
    return version === undefined
      ? undefined
      : { slug: path.slice(version.basePath.length + 1), version: version.id };
  };
  const lines = editProse(markdown.split('\n'), (prose) =>
    keepingInlineCode(prose, (masked) =>
      masked
        .replaceAll(
          /\]\(([^)\s#]+\.md)#([^)\s]+)\)/g,
          (link, path: string, hash: string) => {
            const target = new URL(path, `file:///docs/${page.slug}.md`);
            const slug = /^\/docs\/(.+)\.md$/.exec(
              decodeURIComponent(target.pathname),
            )?.[1];
            if (keep(page.version, slug, hash)) {
              return link;
            }
            dropped.push(`${page.version} ${page.slug}: ${path}#${hash}`);
            return `](${path})`;
          },
        )
        .replaceAll(
          /(\]\(|href=")(\/[^)\s"#]+)#([^)\s"]+)([)"])/g,
          (link, open: string, path: string, hash: string, close: string) => {
            const target = onSite(path);
            if (!target || keep(target.version, target.slug, hash)) {
              return link;
            }
            dropped.push(`${page.version} ${page.slug}: ${path}#${hash}`);
            return `${open}${path}${close}`;
          },
        ),
    ),
  );
  return { dropped, markdown: lines.join('\n') };
}

/**
 * An item of a Docusaurus sidebar, as `sidebars.ts` or a version's
 * `versioned_sidebars/*.json` writes it: a doc's id, or a `doc`, a
 * `category` of items (which may link a doc or a generated index of its
 * items), or a kind the copy skips (`link`).
 */
export type SidebarItem =
  | string
  | {
      readonly id?: string | undefined;
      readonly items?: ReadonlyArray<SidebarItem> | undefined;
      readonly label?: string | undefined;
      readonly link?: CategoryLink | undefined;
      readonly type: string;
    };

/** What a category opens: a doc, or a generated index of its items at `slug`. */
export interface CategoryLink {
  readonly description?: string | undefined;
  readonly id?: string | undefined;
  readonly slug?: string | undefined;
  readonly title?: string | undefined;
  readonly type: string;
}

/** The page Docusaurus generates for a category, listing its items. */
export interface GeneratedIndex {
  readonly description: string;
  /** The ids of the docs it lists: the category's docs and the docs its categories open with. */
  readonly items: ReadonlyArray<string>;
  /** Its slug, without the leading `/`. */
  readonly slug: string;
  readonly title: string;
}

/** Where each doc of the sidebar sits: its section, the doc it nests under, and its order. */
export interface SidebarEntry {
  /** A doc's id, or `index:<slug>` for a generated index. */
  readonly id: string;
  readonly index?: GeneratedIndex | undefined;
  readonly label: string | undefined;
  readonly order: number;
  /** The id of the doc it nests under, if any. */
  readonly parent: string | undefined;
  readonly section: string;
}

const docId = (item: SidebarItem) =>
  typeof item === 'string' ? item : item.type === 'doc' ? item.id : undefined;

/** The page a category opens with: the doc it links, its generated index, or else its first doc. */
function categoryOverview(item: Exclude<SidebarItem, string>):
  | {
      readonly id: string;
      readonly index?: GeneratedIndex;
      readonly items: ReadonlyArray<SidebarItem>;
    }
  | undefined {
  if (item.link?.type === 'doc' && item.link.id !== undefined) {
    return { id: item.link.id, items: item.items ?? [] };
  }
  if (item.link?.type === 'generated-index' && item.link.slug !== undefined) {
    const slug = item.link.slug.replace(/^\//, '');
    const items = item.items ?? [];
    return {
      id: `index:${slug}`,
      index: {
        description: item.link.description ?? '',
        items: items.flatMap((child): Array<string> => {
          const id =
            docId(child) ??
            (typeof child === 'string'
              ? undefined
              : categoryOverview(child)?.id);
          return id === undefined ? [] : [id];
        }),
        slug,
        title: item.link.title ?? item.label ?? slug,
      },
      items,
    };
  }
  const [first, ...rest] = item.items ?? [];
  const id = first === undefined ? undefined : docId(first);
  return id === undefined ? undefined : { id, items: rest };
}

/**
 * The sidebar's docs in order. A top-level category is a section, which
 * starts with the doc or generated index it links. A nested category opens
 * with its overview: the doc it links, its generated index, or else its
 * first doc, which takes the category's label and nests the category's
 * other items: "Links" is `client/links/overview`, with `httpLink` and the
 * rest under it. A nested category without one puts its items where it
 * stands.
 */
export function sidebarSections(items: ReadonlyArray<SidebarItem>) {
  const sections: Array<string> = [];
  const entries: Array<SidebarEntry> = [];
  const add = (entry: Omit<SidebarEntry, 'order'>) => {
    if (!sections.includes(entry.section)) {
      sections.push(entry.section);
    }
    entries.push({ ...entry, order: entries.length });
  };
  const walk = (
    children: ReadonlyArray<SidebarItem>,
    section: string | undefined,
    parent: string | undefined,
  ) => {
    for (const item of children) {
      const id = docId(item);
      if (id !== undefined) {
        add({
          id,
          label: typeof item === 'string' ? undefined : item.label,
          parent,
          section: section ?? '',
        });
        continue;
      }
      if (typeof item === 'string' || item.type !== 'category' || !item.items) {
        continue;
      }
      const label = item.label ?? '';
      const overview =
        item.link === undefined && section === undefined
          ? undefined
          : categoryOverview(item);
      if (section === undefined) {
        if (overview && item.link !== undefined) {
          add({
            id: overview.id,
            index: overview.index,
            label: undefined,
            parent: undefined,
            section: label,
          });
        }
        walk(item.items, label, undefined);
      } else if (overview === undefined) {
        walk(item.items, section, parent);
      } else {
        add({ id: overview.id, index: overview.index, label, parent, section });
        walk(overview.items, section, overview.id);
      }
    }
  };
  walk(items, undefined, undefined);
  return { entries, sections };
}
