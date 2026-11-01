/**
 * The hidden paths (`hiddenPaths` in `src/site.ts`: the decisions pages, and
 * v12's docs while `v12.hidden`) are served for whoever has the link, and
 * for nobody else: no page outside them links there, they're out of the
 * sitemap, `llms.txt`, the feeds and the other text files, robots don't
 * crawl them, and each page there says `noindex, nofollow`, as does every
 * response. `vercel-output.ts` fails the build on any of those slipping.
 */
import type { VercelRoute } from './old-routes.ts';

const robotsMetas = /<meta\b[^>]*\bname="robots"[^>]*>/g;

/** What a page's robots meta tags ask, all of them: `noindex`, `nofollow`. */
const robotsDirectives = (html: string): ReadonlySet<string> =>
  new Set(
    [...html.matchAll(robotsMetas)].flatMap(
      (tag) =>
        /\bcontent="([^"]*)"/
          .exec(tag[0])?.[1]
          ?.split(',')
          .map((directive) => directive.trim()) ?? [],
    ),
  );

/** Whether a prerendered page asks search engines not to index it. */
export const isNoindex = (html: string) =>
  robotsDirectives(html).has('noindex');

/** Whether a prerendered page asks search engines not to index it, nor follow its links. */
const isHidden = (html: string) => {
  const directives = robotsDirectives(html);
  return directives.has('noindex') && directives.has('nofollow');
};

const escapeRegExp = (text: string) =>
  text.replaceAll(/[.*+?^${}()|[\]\\]/g, '\\$&');

const hiddenHeaders = { 'X-Robots-Tag': 'noindex, nofollow' } as const;

/** `X-Robots-Tag: noindex, nofollow` on the path and under it, whatever the host. */
export const hiddenRoute = (basePath: string): VercelRoute => ({
  continue: true,
  headers: hiddenHeaders,
  src: `^${escapeRegExp(basePath)}(?:/.*)?$`,
});

const isUnder = (basePath: string, file: string) =>
  file === `${basePath.slice(1)}/index.html` ||
  file.startsWith(`${basePath.slice(1)}/`);

export interface HiddenPathOptions {
  /**
   * Whether markdown and text files (each page's `.md`, `llms.txt`) may be
   * served there too: v12's docs have them, the decisions pages don't.
   */
  readonly agentFiles?: boolean;
  /** The other hidden paths: what's there may link here. */
  readonly others?: ReadonlyArray<string>;
}

/**
 * What gives the hidden path away in the built site. `files` are the text
 * files (`.html`, `.md`, `.txt`, `.xml`) by their `/`-separated path in the
 * static directory.
 */
export function hiddenPathProblems(
  basePath: string,
  files: ReadonlyMap<string, string>,
  options: HiddenPathOptions = {},
): ReadonlyArray<string> {
  const problems: Array<string> = [];
  // A link, a canonical link, or a meta tag's URL (`og:url`).
  const link = new RegExp(
    `\\b(?:href|content)="(?:https?://[^"/]+)?${escapeRegExp(basePath)}(?:[/"?#])`,
  );
  const robots = files.get('robots.txt') ?? '';
  if (!new RegExp(`^Disallow: ${escapeRegExp(basePath)}$`, 'm').test(robots)) {
    problems.push(`robots.txt: doesn't disallow ${basePath}`);
  }
  let pages = 0;
  for (const [file, text] of files) {
    if (isUnder(basePath, file)) {
      if (file.endsWith('.html')) {
        pages += 1;
        if (!isHidden(text)) {
          problems.push(`${file}: has no noindex, nofollow robots meta tag`);
        }
      } else if (!(options.agentFiles && /\.(?:md|txt)$/.test(file))) {
        problems.push(`${file}: only pages are served under ${basePath}`);
      }
    } else if (
      (options.others ?? []).some((other) => isUnder(other, file)) ||
      file === 'robots.txt'
    ) {
      continue;
    } else if (file.endsWith('.html')) {
      if (link.test(text)) {
        problems.push(`${file}: links to ${basePath}`);
      }
    } else if (text.includes(basePath)) {
      problems.push(`${file}: lists ${basePath}`);
    }
  }
  if (pages === 0) {
    problems.push(`${basePath}: the build has no page there`);
  }
  return problems;
}

/**
 * The `X-Robots-Tag` `routes` answer `pathname` with on every host, as the
 * last word on it, before the files are served.
 */
function robotsTagAt(routes: ReadonlyArray<VercelRoute>, pathname: string) {
  const filesAt = routes.findIndex((route) => route.handle === 'filesystem');
  const before = filesAt === -1 ? routes : routes.slice(0, filesAt);
  return before
    .flatMap((route) =>
      route.continue === true &&
      route.has === undefined &&
      route.missing === undefined &&
      route.src !== undefined &&
      route.headers?.['X-Robots-Tag'] !== undefined &&
      new RegExp(route.src, 'i').test(pathname)
        ? [route.headers['X-Robots-Tag']]
        : [],
    )
    .at(-1);
}

const samplePaths = (basePath: string) => [
  basePath,
  `${basePath}/a`,
  `${basePath}/a.md`,
];

/**
 * The hidden paths whose responses `routes` don't all answer with
 * `X-Robots-Tag: noindex, nofollow`, as the last word on it, before the
 * files are served.
 */
export function hiddenRouteProblems(
  routes: ReadonlyArray<VercelRoute>,
  basePaths: ReadonlyArray<string>,
): ReadonlyArray<string> {
  return basePaths.flatMap((basePath) =>
    samplePaths(basePath).flatMap((pathname) =>
      robotsTagAt(routes, pathname) === hiddenHeaders['X-Robots-Tag']
        ? []
        : [`${pathname}: isn't answered with X-Robots-Tag: noindex, nofollow`],
    ),
  );
}

/** `X-Robots-Tag: noindex` on the path and under it, whatever the host. */
export const unindexedRoute = (basePath: string): VercelRoute => ({
  continue: true,
  headers: { 'X-Robots-Tag': 'noindex' },
  src: `^${escapeRegExp(basePath)}(?:/.*)?$`,
});

/**
 * What lets search engines index an unindexed path (`unindexedPaths` in
 * `src/site.ts`): a response there that `routes` don't answer with
 * `noindex` on every host, a page there without a `noindex` robots meta
 * tag, or a URL there in the sitemap.
 */
export function unindexedPathProblems(
  basePath: string,
  files: ReadonlyMap<string, string>,
  routes: ReadonlyArray<VercelRoute>,
): ReadonlyArray<string> {
  const routeProblems = [...samplePaths(basePath), `${basePath}/docs/a`]
    .filter(
      (pathname) =>
        !(robotsTagAt(routes, pathname) ?? '')
          .split(',')
          .map((directive) => directive.trim())
          .includes('noindex'),
    )
    .map(
      (pathname) => `${pathname}: isn't answered with X-Robots-Tag: noindex`,
    );
  const pageProblems = [...files]
    .filter(
      ([file, html]) =>
        isUnder(basePath, file) && file.endsWith('.html') && !isNoindex(html),
    )
    .map(([file]) => `${file}: has no noindex robots meta tag`);
  const sitemap = files.get('sitemap.xml') ?? '';
  const listed = new RegExp(
    `<loc>(?:https?://[^<"/]+)?${escapeRegExp(basePath)}(?:[/<?#])`,
  ).test(sitemap)
    ? [`sitemap.xml: lists ${basePath}`]
    : [];
  return [...routeProblems, ...pageProblems, ...listed];
}

/** `robots.txt`: crawl everything but the hidden paths, and find the sitemap. */
export const robotsTxt = (opts: {
  readonly hidden: ReadonlyArray<string>;
  readonly sitemap: string;
}) =>
  [
    'User-agent: *',
    'Allow: /',
    ...opts.hidden.map((basePath) => `Disallow: ${basePath}`),
    '',
    `Sitemap: ${opts.sitemap}`,
    '',
  ].join('\n');
