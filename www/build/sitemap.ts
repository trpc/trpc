/**
 * The sitemap TanStack Start writes, checked and corrected: it gives a page
 * without a `lastmod` of its own the build's date, which says every page
 * changed on every deploy, and lists only the pages `vite.config.ts` names,
 * so a new route could be left out.
 */
import { Schema } from 'effect';

/** `pages.json`, which TanStack Start writes next to the sitemap: the pages it lists, as `vite.config.ts` gave them. */
export const SitemapPages = Schema.Struct({
  pages: Schema.Array(
    Schema.Struct({
      path: Schema.String,
      sitemap: Schema.optional(
        Schema.Struct({ lastmod: Schema.optional(Schema.String) }),
      ),
    }),
  ),
});

const locOf = (url: string) => /<loc>([^<]*)<\/loc>/.exec(url)?.[1];

/** The paths `sitemap` lists, on `host`. */
export function sitemapPaths(sitemap: string, host: string) {
  return [...sitemap.matchAll(/<url>[\s\S]*?<\/url>/g)].flatMap((match) => {
    const loc = locOf(match[0]);
    return loc?.startsWith(host) === true ? [loc.slice(host.length)] : [];
  });
}

/** `sitemap` without the `<lastmod>` of the pages `pages` gave none. */
export function withRealLastmods(
  sitemap: string,
  pages: typeof SitemapPages.Type,
  host: string,
) {
  const dated = new Set(
    pages.pages
      .filter((page) => page.sitemap?.lastmod !== undefined)
      .map((page) => `${host}${page.path}`),
  );
  return sitemap.replaceAll(/<url>[\s\S]*?<\/url>/g, (url) => {
    const loc = locOf(url);
    return loc !== undefined && dated.has(loc)
      ? url
      : url.replace(/\s*<lastmod>[^<]*<\/lastmod>/, '');
  });
}

/** The page each prerendered file is: `docs/a/index.html` is `/docs/a`. */
export function pagePaths(files: ReadonlyArray<string>) {
  return files.flatMap((file) => {
    if (file === 'index.html') {
      return ['/'];
    }
    return file.endsWith('/index.html')
      ? [`/${file.slice(0, -'/index.html'.length)}`]
      : [];
  });
}

/** The pages the output serves (`files`) that `sitemap` doesn't list, but for those `unlisted` says stay out. */
export function missingFromSitemap(options: {
  readonly files: ReadonlyArray<string>;
  readonly host: string;
  readonly sitemap: string;
  readonly unlisted: (path: string) => boolean;
}) {
  const listed = new Set(sitemapPaths(options.sitemap, options.host));
  return pagePaths(options.files).filter(
    (page) => !listed.has(page) && !options.unlisted(page),
  );
}
