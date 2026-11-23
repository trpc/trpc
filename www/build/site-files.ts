/**
 * Text files the site writes from its config rather than keeping in
 * `public/`, so they follow `site.url` and the hidden paths: `robots.txt`
 * and `opensearch.xml`. The client build gets them, and the dev server
 * serves them.
 */
import type { Plugin } from 'vite';

import { searchPage, searchParam } from '../src/pages.ts';
import { absoluteUrl } from '../src/seo.ts';
import { hiddenPaths, site } from '../src/site.ts';
import { robotsTxt } from './hidden-paths.ts';

export interface SiteFile {
  readonly contentType: string;
  readonly source: string;
}

/**
 * The OpenSearch description (https://github.com/dewitt/opensearch), with
 * which browsers search the site from their address bar: `/search?q=`.
 */
export const openSearchXml = () =>
  `<?xml version="1.0" encoding="UTF-8"?>
<OpenSearchDescription xmlns="http://a9.com/-/spec/opensearch/1.1/" xmlns:moz="http://www.mozilla.org/2006/browser/search/">
  <ShortName>${site.name}</ShortName>
  <Description>Search ${site.name}</Description>
  <InputEncoding>UTF-8</InputEncoding>
  <Image width="16" height="16" type="image/x-icon">${absoluteUrl('/favicon.ico')}</Image>
  <Url type="text/html" method="get" template="${absoluteUrl(searchPage.path)}?${searchParam}={searchTerms}"/>
  <Url type="application/opensearchdescription+xml" rel="self" template="${absoluteUrl('/opensearch.xml')}"/>
  <moz:SearchForm>${absoluteUrl('/')}</moz:SearchForm>
</OpenSearchDescription>
`;

/** The files, by URL path, for the site as `src/site.ts` configures it. */
export const siteTextFiles = (): ReadonlyMap<string, SiteFile> =>
  new Map([
    [
      '/robots.txt',
      {
        contentType: 'text/plain; charset=utf-8',
        source: robotsTxt({
          hidden: hiddenPaths,
          sitemap: absoluteUrl('/sitemap.xml'),
        }),
      },
    ],
    [
      '/opensearch.xml',
      {
        contentType: 'application/opensearchdescription+xml; charset=utf-8',
        source: openSearchXml(),
      },
    ],
  ]);

/** `files` by URL path: `/robots.txt`. */
export function siteFiles(
  files: ReadonlyMap<string, SiteFile> = siteTextFiles(),
): Plugin {
  return {
    configureServer(server) {
      server.middlewares.use((request, response, next) => {
        const file = files.get(
          new URL(request.url ?? '/', 'http://localhost').pathname,
        );
        if (file === undefined) {
          next();
          return;
        }
        response.setHeader('Content-Type', file.contentType);
        response.end(file.source);
      });
    },
    generateBundle() {
      if (this.environment.name !== 'client') {
        return;
      }
      for (const [pathname, file] of files) {
        this.emitFile({
          fileName: pathname.slice(1),
          source: file.source,
          type: 'asset',
        });
      }
    },
    name: 'site-files',
  };
}
