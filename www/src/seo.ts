import { blog, type CopiedVersion, docPath, site } from './site.ts';

type JsonValue =
  | boolean
  | JsonObject
  | null
  | number
  | ReadonlyArray<JsonValue>
  | string;

/** A Schema.org JSON-LD node. */
interface JsonObject {
  readonly [key: string]: JsonValue | undefined;
}

/** Open Graph's article properties (https://ogp.me/#type_article). */
export interface ArticleSeo {
  /** The authors' profile URLs. */
  readonly authors?: ReadonlyArray<string>;
  /** ISO date. */
  readonly published?: string;
  readonly section?: string;
}

export interface PageSeo {
  readonly article?: ArticleSeo;
  /** Where the page is maintained, if not here. */
  readonly canonical?: string;
  /**
   * Served only to whoever has the link (`hiddenPaths` in `site.ts`):
   * `noindex, nofollow`, and no canonical link for search engines to follow.
   */
  readonly hidden?: boolean;
  readonly description: string;
  /** What the page's social card shows, when it's more than its title. */
  readonly imageAlt?: string;
  /** The page as markdown, for agents: `/docs/<slug>.md`. */
  readonly markdownPath?: string;
  /** Keeps search engines from indexing the page, even once the site is. */
  readonly noindex?: boolean;
  /** Path from the site root, starting with `/`. */
  readonly path: string;
  /** Schema.org JSON-LD objects for the page. */
  readonly structuredData?: ReadonlyArray<JsonObject>;
  /** Page title, without the site name. Omit for the home page. */
  readonly title?: string;
  readonly type?: 'article' | 'website';
}

/** The one host search engines may index. */
export const indexedHost = 'trpc.io';

/**
 * Whether search engines may index a build of the site served at `siteUrl`
 * (`site.url`), with Vercel's `VERCEL_ENV` (`''` off Vercel): only
 * production at trpc.io. Otherwise every page has `<meta name="robots"
 * content="noindex">` and every response `X-Robots-Tag: noindex`; once it
 * is, the header stays on every host but trpc.io (`build/vercel-output.ts`).
 */
export function indexable(siteUrl: string, vercelEnv: string) {
  return new URL(siteUrl).host === indexedHost && vercelEnv === 'production';
}

export function absoluteUrl(path: string) {
  return new URL(path, site.url).href;
}

/**
 * Where a build is served, from Vercel's environment at build time: a
 * preview's branch URL (or its own, without a branch), so a preview's link
 * shows the preview's social card, and `site.url` everywhere else.
 */
export function deploymentOrigin(
  env: Readonly<Record<string, string | undefined>>,
) {
  const host = env['VERCEL_BRANCH_URL'] || env['VERCEL_URL'];
  return env['VERCEL_ENV'] === 'preview' && host ? `https://${host}` : site.url;
}

/**
 * A copied page's canonical URL: trpc.io's, which is the page itself once
 * the site is trpc.io.
 */
export function copyPageUrl(version: CopiedVersion, slug: string) {
  return `${version.url}${docPath(version, slug)}`;
}

/** A copied post on trpc.io's blog. */
export function trpcPostUrl(slug: string) {
  return `${blog.url}/${slug}`;
}

/** `2025-03-21` as `March 21, 2025`, whatever the reader's time zone. */
export function postDate(date: string) {
  return new Intl.DateTimeFormat('en-US', {
    dateStyle: 'long',
    timeZone: 'UTC',
  }).format(new Date(`${date}T00:00:00Z`));
}

/** Where a page's social card is served (`routes/og.$.ts`). */
export function ogImagePath(path: string) {
  return `/og${path === '/' ? '/index' : path}.png`;
}

/** Social cards' size, in pixels. */
export const ogImageSize = { height: 630, width: 1200 } as const;

/** A page's social card, as an absolute URL on the deployment that serves it. */
export function ogImageUrl(path: string) {
  return new URL(
    ogImagePath(path),
    import.meta.env.DEPLOYMENT_ORIGIN || site.url,
  ).href;
}

function articleMeta(article: ArticleSeo | undefined) {
  if (!article) {
    return [];
  }
  return [
    ...(article.published === undefined
      ? []
      : [{ content: article.published, property: 'article:published_time' }]),
    ...(article.authors ?? []).map((author) => ({
      content: author,
      property: 'article:author',
    })),
    ...(article.section === undefined
      ? []
      : [{ content: article.section, property: 'article:section' }]),
  ];
}

/** `head()` for a route: title, description, canonical URL, social cards and JSON-LD. */
export function pageHead(page: PageSeo) {
  const title = page.title
    ? `${page.title} | ${site.name}`
    : `${site.name} - ${site.tagline.join(' ')}`;
  const url = page.canonical ?? absoluteUrl(page.path);
  const image = ogImageUrl(page.path);
  const imageAlt = page.imageAlt ?? page.title ?? site.tagline.join(' ');
  return {
    links: [
      ...(page.hidden
        ? []
        : [
            { href: url, rel: 'canonical' },
            // The site is in English only.
            { href: url, hrefLang: 'en', rel: 'alternate' },
            { href: url, hrefLang: 'x-default', rel: 'alternate' },
          ]),
      ...(page.markdownPath === undefined
        ? []
        : [
            {
              href: page.markdownPath,
              rel: 'alternate',
              title: 'Markdown',
              type: 'text/markdown',
            },
          ]),
    ],
    meta: [
      { title },
      ...(page.hidden
        ? [{ content: 'noindex, nofollow', name: 'robots' }]
        : page.noindex
          ? [{ content: 'noindex', name: 'robots' }]
          : []),
      { content: page.description, name: 'description' },
      { content: title, property: 'og:title' },
      { content: page.description, property: 'og:description' },
      { content: url, property: 'og:url' },
      { content: page.type ?? 'website', property: 'og:type' },
      { content: site.name, property: 'og:site_name' },
      { content: 'en_US', property: 'og:locale' },
      { content: image, property: 'og:image' },
      { content: 'image/png', property: 'og:image:type' },
      { content: String(ogImageSize.width), property: 'og:image:width' },
      { content: String(ogImageSize.height), property: 'og:image:height' },
      { content: imageAlt, property: 'og:image:alt' },
      ...articleMeta(page.article),
      { content: 'summary_large_image', name: 'twitter:card' },
      { content: site.x, name: 'twitter:site' },
      { content: title, name: 'twitter:title' },
      { content: page.description, name: 'twitter:description' },
      { content: image, name: 'twitter:image' },
      { content: imageAlt, name: 'twitter:image:alt' },
    ],
    scripts: (page.structuredData ?? []).map((data) => ({
      children: JSON.stringify({ '@context': 'https://schema.org', ...data }),
      type: 'application/ld+json',
    })),
  };
}
