/**
 * The sitemap TanStack Start writes, checked and corrected: it dates every
 * page with the build, which says every page changed on every deploy, so
 * the dates go; and it lists only the pages `vite.config.ts` names, so a
 * new route could be left out.
 */
const locOf = (url: string) => /<loc>([^<]*)<\/loc>/.exec(url)?.[1];

/** The paths `sitemap` lists, on `host`. */
export function sitemapPaths(sitemap: string, host: string) {
  return [...sitemap.matchAll(/<url>[\s\S]*?<\/url>/g)].flatMap((match) => {
    const loc = locOf(match[0]);
    return loc?.startsWith(host) === true ? [loc.slice(host.length)] : [];
  });
}

/** `sitemap` without its `<lastmod>`s. */
export const withoutLastmods = (sitemap: string) =>
  sitemap.replaceAll(/\s*<lastmod>[^<]*<\/lastmod>/g, '');

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
