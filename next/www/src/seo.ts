import { site, v11 } from './site.ts';

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

export interface PageSeo {
  /** Where the page is maintained, if not here. */
  readonly canonical?: string;
  readonly description: string;
  /** The page as markdown, for agents: `/docs/<slug>.md`. */
  readonly markdownPath?: string;
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

/** A v11 page on trpc.io, which serves the first page at `/docs`. */
export function v11PageUrl(slug: string) {
  return `${v11.url}/docs${slug === v11.firstDoc ? '' : `/${slug}`}`;
}

/** Where the build writes a page's social card (`build/og-image.ts`). */
export function ogImagePath(path: string) {
  return `/og${path === '/' ? '/index' : path}.png`;
}

/** Social cards' size, in pixels. */
export const ogImageSize = { height: 630, width: 1200 } as const;

/** `head()` for a route: title, description, canonical URL, social cards and JSON-LD. */
export function pageHead(page: PageSeo) {
  const title = page.title
    ? `${page.title} | ${site.name}`
    : `${site.name} - ${site.tagline.join(' ')}`;
  const url = page.canonical ?? absoluteUrl(page.path);
  const image = absoluteUrl(ogImagePath(page.path));
  const imageAlt = page.title ?? site.tagline.join(' ');
  return {
    links: [
      { href: url, rel: 'canonical' },
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
      { content: page.description, name: 'description' },
      { content: title, property: 'og:title' },
      { content: page.description, property: 'og:description' },
      { content: url, property: 'og:url' },
      { content: page.type ?? 'website', property: 'og:type' },
      { content: site.name, property: 'og:site_name' },
      { content: image, property: 'og:image' },
      { content: String(ogImageSize.width), property: 'og:image:width' },
      { content: String(ogImageSize.height), property: 'og:image:height' },
      { content: imageAlt, property: 'og:image:alt' },
      { content: 'summary_large_image', name: 'twitter:card' },
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
