import { blog, type CopiedVersion, site } from './site.ts';

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
  readonly modified?: string | undefined;
  /** ISO date. */
  readonly published?: string;
  readonly section?: string;
}

export interface PageSeo {
  readonly article?: ArticleSeo;
  /** Where the page is maintained, if not here. */
  readonly canonical?: string;
  readonly description: string;
  /** The page as markdown, for agents: `/v12/docs/<slug>.md`. */
  readonly markdownPath?: string;
  /** Keeps search engines from indexing the page. */
  readonly noindex?: boolean;
  /** Path from the site root, starting with `/`. */
  readonly path: string;
  /** Schema.org JSON-LD objects for the page. */
  readonly structuredData?: ReadonlyArray<JsonObject>;
  /** Page title, without the site name. Omit for the home page. */
  readonly title?: string;
  readonly type?: 'article' | 'website';
}

export function absoluteUrl(path: string) {
  return new URL(path, site.url).href;
}

/** A copied page on trpc.io, which serves each version's first page at its `trpcPath`. */
export function trpcPageUrl(version: CopiedVersion, slug: string) {
  return `${version.url}${version.trpcPath}${slug === version.firstDoc ? '' : `/${slug}`}`;
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

/** Where the build writes a page's social card (`build/og-image.ts`). */
export function ogImagePath(path: string) {
  return `/og${path === '/' ? '/index' : path}.png`;
}

/** Social cards' size, in pixels. */
export const ogImageSize = { height: 630, width: 1200 } as const;

/** A page's social card, as an absolute URL. */
export function ogImageUrl(path: string) {
  return absoluteUrl(ogImagePath(path));
}

function articleMeta(article: ArticleSeo | undefined) {
  if (!article) {
    return [];
  }
  return [
    ...(article.published === undefined
      ? []
      : [{ content: article.published, property: 'article:published_time' }]),
    ...(article.modified === undefined
      ? []
      : [{ content: article.modified, property: 'article:modified_time' }]),
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
  const imageAlt = page.title ?? site.tagline.join(' ');
  return {
    links: [
      { href: url, rel: 'canonical' },
      // The site is in English only.
      { href: url, hrefLang: 'en', rel: 'alternate' },
      { href: url, hrefLang: 'x-default', rel: 'alternate' },
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
      ...(page.noindex ? [{ content: 'noindex', name: 'robots' }] : []),
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
