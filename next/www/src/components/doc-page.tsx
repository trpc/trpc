import { Link, notFound, Outlet } from '@tanstack/react-router';
import {
  ArrowLeft,
  ArrowRight,
  ChevronRight,
  ExternalLink,
  Pencil,
} from 'lucide-react';

import { DocBody } from '~/components/doc-body.tsx';
import { DocsNav } from '~/components/docs-nav.tsx';
import { PageActions } from '~/components/page-actions.tsx';
import {
  PartnersRail,
  PartnersStrip,
} from '~/components/sponsors/partners.tsx';
import {
  CollapsedTableOfContents,
  TableOfContents,
} from '~/components/toc.tsx';
import { VersionBanner } from '~/components/version-banner.tsx';
import {
  ancestors,
  childrenOf,
  type DocsVersion,
  findDoc,
  neighbours,
} from '~/content/docs.ts';
import type { Doc } from '~/content/types.ts';
import { useFlag } from '~/flags.ts';
import { absoluteUrl, pageHead, trpcPageUrl } from '~/seo.ts';
import { site } from '~/site.ts';
import { partners } from '~/sponsors.ts';

export function DocsLayout() {
  return (
    <div className="mx-auto grid max-w-7xl gap-10 px-4 sm:px-6 md:grid-cols-[14rem_minmax(0,1fr)]">
      <aside className="hidden md:block">
        <div className="sticky top-14 max-h-[calc(100dvh-3.5rem)] overflow-y-auto py-8 pr-2">
          <DocsNav />
        </div>
      </aside>
      <Outlet />
    </div>
  );
}

/** Loads a page of `version` for its route, or 404s. */
export async function loadDocPage(version: DocsVersion, slug: string) {
  if (!findDoc(version, slug)) {
    throw notFound();
  }
  return { doc: await version.load(slug) };
}

/**
 * A page's `head()`. The copies of the older versions point search engines
 * at trpc.io, where those docs live, and have no markdown for agents.
 */
export function docHead(version: DocsVersion, slug: string) {
  const meta = findDoc(version, slug);
  if (!meta) {
    return { meta: [{ title: `Not found | ${site.name}` }] };
  }
  const path = `${version.basePath}/${meta.slug}`;
  const description = meta.description || site.description;
  if (version.copied) {
    return pageHead({
      canonical: trpcPageUrl(version.copied, meta.slug),
      description,
      path,
      title: `${meta.title} (${version.id})`,
      type: 'article',
    });
  }
  return pageHead({
    description,
    markdownPath: `${path}.md`,
    path,
    structuredData: [
      {
        '@type': 'TechArticle',
        dateModified: meta.lastModified,
        description,
        headline: meta.title,
        inLanguage: 'en',
        isPartOf: { '@type': 'WebSite', name: site.name, url: site.url },
        mainEntityOfPage: absoluteUrl(path),
        proficiencyLevel: 'Expert',
      },
      {
        '@type': 'BreadcrumbList',
        itemListElement: [
          {
            '@type': 'ListItem',
            item: site.url,
            name: site.name,
            position: 1,
          },
          { '@type': 'ListItem', name: meta.section, position: 2 },
          ...ancestors(version, meta.slug).map((parent, index) => ({
            '@type': 'ListItem',
            item: absoluteUrl(`${version.basePath}/${parent.slug}`),
            name: parent.title,
            position: 3 + index,
          })),
          {
            '@type': 'ListItem',
            item: absoluteUrl(path),
            name: meta.title,
            position: 3 + ancestors(version, meta.slug).length,
          },
        ],
      },
    ],
    title: meta.title,
    type: 'article',
  });
}

const footerLink =
  'inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground';

export function DocPage(props: {
  readonly doc: Doc;
  readonly version: DocsVersion;
}) {
  const doc = props.doc;
  const version = props.version;
  const around = neighbours(version, doc.slug);
  const parents = ancestors(version, doc.slug);
  const children = childrenOf(version, doc.slug);
  const showPartners = useFlag('partners') && partners.length > 0;

  return (
    <div className="grid min-w-0 gap-10 py-8 xl:grid-cols-[minmax(0,1fr)_13rem]">
      <article className="min-w-0">
        <VersionBanner slug={doc.slug} version={version} />
        <header className="mb-8 grid gap-3 border-b pb-6">
          <nav aria-label="Breadcrumb">
            <ol className="flex flex-wrap items-center gap-x-1.5 text-sm font-semibold text-link">
              <li>{doc.section}</li>
              {parents.map((parent) => (
                <li className="flex items-center gap-1.5" key={parent.slug}>
                  <ChevronRight
                    aria-hidden
                    className="size-3.5 text-muted-foreground"
                  />
                  <Link
                    className="hover:underline"
                    params={{ _splat: parent.slug }}
                    to={version.route}
                  >
                    {parent.label ?? parent.title}
                  </Link>
                </li>
              ))}
            </ol>
          </nav>
          <h1 className="text-3xl font-bold tracking-tight text-balance sm:text-4xl">
            {doc.title}
          </h1>
          {doc.description ? (
            <p className="text-lg text-pretty text-muted-foreground">
              {doc.description}
            </p>
          ) : null}
          {version.id === 'v12' ? (
            <PageActions key={doc.slug} slug={doc.slug} />
          ) : null}
        </header>
        <CollapsedTableOfContents
          className="mb-8 xl:hidden"
          headings={doc.headings}
          key={doc.slug}
        />
        <DocBody html={doc.html} />
        {children.length > 0 ? (
          <section aria-labelledby="pages-under" className="mt-10">
            <h2
              className="mb-4 text-lg font-semibold tracking-tight"
              id="pages-under"
            >
              Pages under {doc.label ?? doc.title}
            </h2>
            <ul className="grid gap-3 sm:grid-cols-2">
              {children.map((child) => (
                <li key={child.slug}>
                  <Link
                    className="grid h-full gap-1 rounded-lg border p-4 transition-colors hover:bg-accent/50"
                    params={{ _splat: child.slug }}
                    to={version.route}
                  >
                    <span className="font-medium">
                      {child.label ?? child.title}
                    </span>
                    <span className="text-sm text-pretty text-muted-foreground">
                      {child.description}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        ) : null}
        <footer className="mt-12 grid gap-6 border-t pt-6">
          {showPartners ? <PartnersStrip className="xl:hidden" /> : null}
          {version.copied ? (
            <a
              className={footerLink}
              href={trpcPageUrl(version.copied, doc.slug)}
            >
              <ExternalLink className="size-3.5" /> Read this page on trpc.io
            </a>
          ) : (
            <a
              className={footerLink}
              href={`${site.github}/edit/v12/next/docs/${doc.slug}.md`}
            >
              <Pencil className="size-3.5" /> Edit this page on GitHub
            </a>
          )}
          <nav aria-label="Pagination" className="grid gap-3 sm:grid-cols-2">
            {around.previous ? (
              <Link
                className="group grid gap-1 rounded-lg border p-4 hover:bg-accent/50"
                params={{ _splat: around.previous.slug }}
                to={version.route}
              >
                <span className="flex items-center gap-1 text-xs text-muted-foreground">
                  <ArrowLeft className="size-3" /> Previous
                </span>
                <span className="font-medium">
                  {around.previous.label ?? around.previous.title}
                </span>
              </Link>
            ) : (
              <span className="hidden sm:block" />
            )}
            {around.next ? (
              <Link
                className="group grid gap-1 rounded-lg border p-4 text-right hover:bg-accent/50"
                params={{ _splat: around.next.slug }}
                to={version.route}
              >
                <span className="flex items-center justify-end gap-1 text-xs text-muted-foreground">
                  Next <ArrowRight className="size-3" />
                </span>
                <span className="font-medium">
                  {around.next.label ?? around.next.title}
                </span>
              </Link>
            ) : null}
          </nav>
        </footer>
      </article>
      <aside className="hidden xl:block">
        <div className="sticky top-22 grid gap-10">
          <TableOfContents headings={doc.headings} key={doc.slug} />
          {showPartners ? <PartnersRail /> : null}
        </div>
      </aside>
    </div>
  );
}
