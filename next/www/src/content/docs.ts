import { notFound, useLocation } from '@tanstack/react-router';
import { sections as v12Sections } from 'virtual:docs-manifest';
import { sections as v11Sections } from 'virtual:v11-docs-manifest';

import { v11 } from '~/site.ts';

import type { Doc, DocMeta, DocSection } from './types.ts';

/** One version's pages, and where the site serves them. */
export interface DocsVersion {
  readonly allDocs: ReadonlyArray<DocMeta>;
  readonly basePath: '/docs' | '/v11/docs';
  readonly firstDoc: string;
  readonly id: 'v11' | 'v12';
  /** The page route, for `<Link to>`. */
  readonly route: '/docs/$' | '/v11/docs/$';
  readonly sections: ReadonlyArray<DocSection>;
  readonly status: 'experimental' | 'stable';
  /** A page, compiled at build time. */
  readonly load: (slug: string) => Promise<Doc>;
}

function docsVersion(
  version: Omit<DocsVersion, 'allDocs' | 'firstDoc' | 'load'>,
  pages: Readonly<Record<string, () => Promise<{ default: Doc }>>>,
  fileOf: (slug: string) => string,
  fallback: string,
): DocsVersion {
  const allDocs = version.sections.flatMap((section) => section.docs);
  return {
    ...version,
    allDocs,
    firstDoc: allDocs[0]?.slug ?? fallback,
    load: async (slug) => {
      const load = pages[fileOf(slug)];
      if (!load) {
        throw notFound();
      }
      const page = await load();
      return page.default;
    },
  };
}

// Each page is its own content-hashed chunk: the browser downloads a page
// once per deploy and the CDN can cache it forever.
export const v12Docs = docsVersion(
  {
    basePath: '/docs',
    id: 'v12',
    route: '/docs/$',
    sections: v12Sections,
    status: 'experimental',
  },
  import.meta.glob<{ default: Doc }>([
    '../../../docs/**/*.md',
    '!../../../docs/**/README.md',
  ]),
  (slug) => `../../../docs/${slug}.md`,
  'getting-started',
);

export const v11Docs = docsVersion(
  {
    basePath: v11.basePath,
    id: 'v11',
    route: '/v11/docs/$',
    sections: v11Sections,
    status: 'stable',
  },
  import.meta.glob<{ default: Doc }>([
    '../../v11/docs/**/*.md',
    '!../../v11/docs/**/README.md',
  ]),
  (slug) => `../../v11/docs/${slug}.md`,
  v11.firstDoc,
);

export const versions = [v12Docs, v11Docs] as const;

/** The version whose pages `pathname` is among: v12 everywhere but `/v11/docs`. */
export function versionAt(pathname: string): DocsVersion {
  return pathname === v11Docs.basePath ||
    pathname.startsWith(`${v11Docs.basePath}/`)
    ? v11Docs
    : v12Docs;
}

/** The version of the page the reader is on. */
export function useDocsVersion() {
  return versionAt(useLocation({ select: (location) => location.pathname }));
}

export function findDoc(
  version: DocsVersion,
  slug: string,
): DocMeta | undefined {
  return version.allDocs.find((doc) => doc.slug === slug);
}

/** The pages before and after `slug` in sidebar order. */
export function neighbours(version: DocsVersion, slug: string) {
  const index = version.allDocs.findIndex((doc) => doc.slug === slug);
  return {
    next: index === -1 ? undefined : version.allDocs[index + 1],
    previous: index <= 0 ? undefined : version.allDocs[index - 1],
  };
}

/**
 * The page on the same topic in the other version: the v11 page a v12 page
 * names (`v11` frontmatter, or else the page at its slug), and for a v11
 * page, the v12 page at its slug or else the first that names it.
 */
export function counterpart(
  version: DocsVersion,
  slug: string,
): DocMeta | undefined {
  if (version.id === 'v12') {
    const v11Slug = findDoc(v12Docs, slug)?.v11;
    return v11Slug === undefined ? undefined : findDoc(v11Docs, v11Slug);
  }
  const same = findDoc(v12Docs, slug);
  return same?.v11 === slug
    ? same
    : v12Docs.allDocs.find((doc) => doc.v11 === slug);
}

/** The slug of the page `pathname` shows in `version`, if it's a page. */
export function slugAt(version: DocsVersion, pathname: string) {
  const prefix = `${version.basePath}/`;
  if (!pathname.startsWith(prefix)) {
    return undefined;
  }
  const slug = pathname.slice(prefix.length).replace(/\/$/, '');
  return findDoc(version, slug) ? slug : undefined;
}

/**
 * Where switching from `slug` in `from` to the version `to` goes: the same
 * page, or its counterpart, or else the first page of `to`.
 */
export function switchedSlug(
  from: DocsVersion,
  slug: string | undefined,
  to: DocsVersion,
) {
  if (slug === undefined) {
    return to.firstDoc;
  }
  if (from.id === to.id) {
    return slug;
  }
  return counterpart(from, slug)?.slug ?? to.firstDoc;
}
