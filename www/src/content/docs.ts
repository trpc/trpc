import { notFound, useLocation } from '@tanstack/react-router';
import { sections as v9Sections } from 'virtual:v9-docs-manifest';
import { sections as v10Sections } from 'virtual:v10-docs-manifest';
import { sections as v11Sections } from 'virtual:v11-docs-manifest';

import type { ExperimentId } from '~/experiments.ts';
import { useFlagsOn } from '~/flags.ts';
import { type CopiedVersion, v9, v10, v11 } from '~/site.ts';

import { listedSections } from './listed.ts';
import type { Doc, DocMeta, DocSection } from './types.ts';

/** One version's pages, and where the site serves them. */
export interface DocsVersion {
  readonly allDocs: ReadonlyArray<DocMeta>;
  readonly basePath: CopiedVersion['basePath'];
  /** The version of trpc.io's docs it is. */
  readonly copied: CopiedVersion;
  readonly firstDoc: string;
  readonly id: CopiedVersion['id'];
  /** The page route, for `<Link to>`. */
  readonly route: '/docs/$' | '/docs/v10/$' | '/docs/v9/$';
  readonly sections: ReadonlyArray<DocSection>;
  readonly status: CopiedVersion['status'];
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
    firstDoc:
      allDocs.find((doc) => doc.experiment === undefined)?.slug ?? fallback,
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

function copiedDocs(
  copied: CopiedVersion,
  route: DocsVersion['route'],
  sections: ReadonlyArray<DocSection>,
  pages: Readonly<Record<string, () => Promise<{ default: Doc }>>>,
) {
  return docsVersion(
    {
      basePath: copied.basePath,
      copied,
      id: copied.id,
      route,
      sections,
      status: copied.status,
    },
    pages,
    (slug) => `../../${copied.id}/docs/${slug}.md`,
    copied.firstDoc,
  );
}

// Each page is its own content-hashed chunk: the browser downloads a page
// once per deploy and the CDN can cache it forever.
export const v11Docs = copiedDocs(
  v11,
  '/docs/$',
  v11Sections,
  import.meta.glob<{ default: Doc }>([
    '../../v11/docs/**/*.md',
    '!../../v11/docs/**/README.md',
  ]),
);

export const v10Docs = copiedDocs(
  v10,
  '/docs/v10/$',
  v10Sections,
  import.meta.glob<{ default: Doc }>([
    '../../v10/docs/**/*.md',
    '!../../v10/docs/**/README.md',
  ]),
);

export const v9Docs = copiedDocs(
  v9,
  '/docs/v9/$',
  v9Sections,
  import.meta.glob<{ default: Doc }>([
    '../../v9/docs/**/*.md',
    '!../../v9/docs/**/README.md',
  ]),
);

/** Newest first, as the version switcher lists them. */
export const versions = [v11Docs, v10Docs, v9Docs] as const;

/** The version whose pages `pathname` is among, and v11, the stable release, off the docs. */
export function versionAt(pathname: string): DocsVersion {
  return (
    versions
      .toSorted((a, b) => b.basePath.length - a.basePath.length)
      .find(
        (version) =>
          pathname === version.basePath ||
          pathname.startsWith(`${version.basePath}/`),
      ) ?? v11Docs
  );
}

/** The version of the page the reader is on. */
export function useDocsVersion() {
  return versionAt(useLocation({ select: (location) => location.pathname }));
}

/** The version the search dialog looks in: the page's, and v11 off the docs. */
export function useSearchedDocs(): DocsVersion {
  return useDocsVersion();
}

const listedVersions = new WeakMap<DocsVersion, Map<string, DocsVersion>>();

/**
 * `version` as the sidebar, search and pagination list it: without the
 * pages of experiments that aren't `on`. `findDoc` doesn't find those in it;
 * look in `version`.
 */
export function listedDocs(
  version: DocsVersion,
  on: ReadonlyArray<ExperimentId> = [],
): DocsVersion {
  const byOn = listedVersions.get(version) ?? new Map<string, DocsVersion>();
  listedVersions.set(version, byOn);
  const key = on.join(',');
  const cached = byOn.get(key);
  if (cached) {
    return cached;
  }
  const sections = listedSections(version.sections, on);
  const listed: DocsVersion = {
    ...version,
    allDocs: sections.flatMap((section) => section.docs),
    sections,
  };
  byOn.set(key, listed);
  return listed;
}

/** `version` as the reader browses it: with the experiments the URL turns on. */
export function useListedDocs(version: DocsVersion) {
  return listedDocs(version, useFlagsOn());
}

export function findDoc(
  version: DocsVersion,
  slug: string,
): DocMeta | undefined {
  return version.allDocs.find((doc) => doc.slug === slug);
}

/** The pages `slug` nests under in the sidebar, outermost first. */
export function ancestors(
  version: DocsVersion,
  slug: string,
): ReadonlyArray<DocMeta> {
  const parent = findDoc(version, findDoc(version, slug)?.parent ?? '');
  return parent ? [...ancestors(version, parent.slug), parent] : [];
}

/** The pages nested right under `slug`, in sidebar order. */
export function childrenOf(
  version: DocsVersion,
  slug: string,
): ReadonlyArray<DocMeta> {
  return version.allDocs.filter((doc) => doc.parent === slug);
}

/** The pages before and after `slug` in sidebar order. */
export function neighbours(version: DocsVersion, slug: string) {
  const index = version.allDocs.findIndex((doc) => doc.slug === slug);
  return {
    next: index === -1 ? undefined : version.allDocs[index + 1],
    previous: index <= 0 ? undefined : version.allDocs[index - 1],
  };
}

/** The page on the same topic in the version `to`: the one at the same slug, as Docusaurus had it. */
export function counterpart(
  _from: DocsVersion,
  slug: string,
  to: DocsVersion,
): DocMeta | undefined {
  return findDoc(to, slug);
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
 * Where switching from `slug` in `from` to the version `to` goes: the page
 * on its topic, or else the first page of `to`.
 */
export function switchedSlug(
  from: DocsVersion,
  slug: string | undefined,
  to: DocsVersion,
) {
  if (slug === undefined) {
    return to.firstDoc;
  }
  return counterpart(from, slug, to)?.slug ?? to.firstDoc;
}
