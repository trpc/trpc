import { Badge } from '@shared/ui/components/badge';
import { cn } from '@shared/ui/lib/utils';
import { Link, notFound, Outlet } from '@tanstack/react-router';
import {
  ArrowLeft,
  ArrowRight,
  ChevronRight,
  ExternalLink,
  FlaskConical,
  Pencil,
  Wrench,
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
import { TextWithCode } from '~/components/text-with-code.tsx';
import { VersionBanner } from '~/components/version-banner.tsx';
import {
  ancestors,
  childrenOf,
  type DocsVersion,
  findDoc,
  listedDocs,
  neighbours,
  useListedDocs,
} from '~/content/docs.ts';
import { stripInlineCode } from '~/content/inline-code.ts';
import type { Doc } from '~/content/types.ts';
import { experiments } from '~/experiments.ts';
import { CodemodPlaygroundSlot } from '~/codemod-playground/slot.tsx';
import { PageDemo } from '~/kitchen-sink/embed.tsx';
import { useEnableOnVisit } from '~/flags.ts';
import {
  absoluteUrl,
  copyPageUrl,
  ogImageUrl,
  pageHead,
  trpcPageUrl,
} from '~/seo.ts';
import { atTrpcIo, site, v11, v12, v12Indexable } from '~/site.ts';
import { partners } from '~/sponsors.ts';

export function DocsLayout() {
  return (
    <div className="mx-auto grid max-w-7xl gap-10 px-4 sm:px-6 md:grid-cols-[14rem_minmax(0,1fr)] has-data-demo-page:max-w-[112rem]">
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

/** A page's breadcrumbs, for search results, by the URL of each page in them. */
function breadcrumbs(
  version: DocsVersion,
  meta: NonNullable<ReturnType<typeof findDoc>>,
  urlOf: (slug: string) => string,
) {
  const parents = ancestors(version, meta.slug);
  return {
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', item: site.url, name: site.name, position: 1 },
      {
        '@type': 'ListItem',
        // A section has no page of its own; it opens with its first.
        item: urlOf(
          listedDocs(version).sections.find(
            (section) => section.title === meta.section,
          )?.docs[0]?.slug ?? meta.slug,
        ),
        name: meta.section,
        position: 2,
      },
      ...parents.map((parent, index) => ({
        '@type': 'ListItem',
        item: urlOf(parent.slug),
        name: stripInlineCode(parent.title),
        position: 3 + index,
      })),
      {
        '@type': 'ListItem',
        item: urlOf(meta.slug),
        name: stripInlineCode(meta.title),
        position: 3 + parents.length,
      },
    ],
  };
}

/**
 * A page's `head()`. The copies of the older versions point search engines
 * at trpc.io, where those docs live, and have no markdown for agents. While
 * v12 is hidden, its pages say `noindex, nofollow`, and v11's are the docs.
 */
export function docHead(version: DocsVersion, slug: string) {
  const meta = findDoc(version, slug);
  if (!meta) {
    return { meta: [{ title: `Not found | ${site.name}` }] };
  }
  const path = `${version.basePath}/${meta.slug}`;
  const title = stripInlineCode(meta.title);
  const description = stripInlineCode(meta.description) || site.description;
  const copied = version.copied;
  if (copied) {
    return pageHead({
      canonical: copyPageUrl(copied, meta.slug),
      description,
      path,
      structuredData: [
        breadcrumbs(version, meta, (page) => copyPageUrl(copied, page)),
      ],
      title:
        v12.hidden && copied.id === v11.id ? title : `${title} (${version.id})`,
      type: 'article',
    });
  }
  return pageHead({
    article: { modified: meta.lastModified, section: meta.section },
    description,
    hidden: v12.hidden,
    markdownPath: `${path}.md`,
    noindex: meta.experiment !== undefined || !v12Indexable,
    path,
    structuredData: [
      {
        '@type': 'TechArticle',
        dateModified: meta.lastModified,
        description,
        headline: title,
        image: ogImageUrl(path),
        inLanguage: 'en',
        isPartOf: { '@type': 'WebSite', name: site.name, url: site.url },
        mainEntityOfPage: absoluteUrl(path),
        proficiencyLevel: 'Expert',
      },
      breadcrumbs(version, meta, (page) =>
        absoluteUrl(`${version.basePath}/${page}`),
      ),
    ],
    title,
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
  const listed = useListedDocs(version);
  const around = neighbours(listed, doc.slug);
  const parents = ancestors(version, doc.slug);
  const children = childrenOf(listed, doc.slug);
  const showPartners = partners.length > 0;
  const demo = doc.demo;
  useEnableOnVisit(doc.experiment, doc.slug);

  return (
    <div
      className={cn(
        'grid min-w-0 gap-10 py-8',
        demo
          ? 'xl:grid-cols-[minmax(0,1fr)_minmax(0,1.25fr)]'
          : 'xl:grid-cols-[minmax(0,1fr)_13rem]',
      )}
      data-demo-page={demo}
    >
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
                    <TextWithCode bare text={parent.label ?? parent.title} />
                  </Link>
                </li>
              ))}
            </ol>
          </nav>
          {doc.stability === 'unstable' ? (
            <p className="flex flex-wrap items-center gap-2 text-sm text-pretty text-muted-foreground">
              <Badge variant="outline">
                <Wrench className="text-brand" /> Unstable
              </Badge>
              <span>
                How it works might change in a minor release.{' '}
                <Link
                  className="text-link hover:underline"
                  hash="unstable"
                  params={{ _splat: 'packages' }}
                  to={version.route}
                >
                  Stability
                </Link>
              </span>
            </p>
          ) : doc.experiment ? (
            <p className="flex flex-wrap items-center gap-2 text-sm text-pretty text-muted-foreground">
              <Badge variant="outline">
                <FlaskConical className="text-brand" /> Experimental
              </Badge>
              <span>
                {experiments[doc.experiment].label} might change or go away in
                any release.{' '}
                <Link
                  className="text-link hover:underline"
                  hash="experimental"
                  params={{ _splat: 'packages' }}
                  to={version.route}
                >
                  Stability
                </Link>
              </span>
            </p>
          ) : null}
          <h1 className="text-3xl font-bold tracking-tight text-balance sm:text-4xl">
            <TextWithCode text={doc.title} />
          </h1>
          {doc.description ? (
            <p className="text-lg text-pretty text-muted-foreground">
              <TextWithCode text={doc.description} />
            </p>
          ) : null}
          {version.id === 'v12' ? (
            <PageActions key={doc.slug} slug={doc.slug} />
          ) : null}
        </header>
        <CollapsedTableOfContents
          className={cn('mb-8', !demo && 'xl:hidden')}
          headings={doc.headings}
          key={doc.slug}
        />
        <DocBody html={doc.html} />
        {demo ? <PageDemo demo={demo} html={doc.html} mode="inline" /> : null}
        <CodemodPlaygroundSlot html={doc.html} />
        {children.length > 0 ? (
          <section aria-labelledby="pages-under" className="mt-10">
            <h2
              className="mb-4 text-lg font-semibold tracking-tight"
              id="pages-under"
            >
              Pages under <TextWithCode text={doc.label ?? doc.title} />
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
                      <TextWithCode bare text={child.label ?? child.title} />
                    </span>
                    <span className="text-sm text-pretty text-muted-foreground">
                      <TextWithCode text={child.description} />
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        ) : null}
        <footer className="mt-12 grid gap-6 border-t pt-6">
          {showPartners ? (
            <PartnersStrip className={cn(!demo && 'xl:hidden')} />
          ) : null}
          {version.copied ? (
            atTrpcIo ? null : (
              <a
                className={footerLink}
                href={trpcPageUrl(version.copied, doc.slug)}
              >
                <ExternalLink className="size-3.5" /> Read this page on trpc.io
              </a>
            )
          ) : (
            <a
              className={footerLink}
              href={`${site.github}/edit/v12/next/www/docs/${doc.slug}.md`}
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
                  <TextWithCode
                    bare
                    text={around.previous.label ?? around.previous.title}
                  />
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
                  <TextWithCode
                    bare
                    text={around.next.label ?? around.next.title}
                  />
                </span>
              </Link>
            ) : null}
          </nav>
        </footer>
      </article>
      <aside className="hidden xl:block">
        {demo ? (
          <div className="sticky top-22 h-[calc(100dvh-7rem)]">
            <PageDemo demo={demo} html={doc.html} mode="aside" />
          </div>
        ) : (
          <div className="sticky top-22 grid gap-10">
            <TableOfContents headings={doc.headings} key={doc.slug} />
            {showPartners ? <PartnersRail /> : null}
          </div>
        )}
      </aside>
    </div>
  );
}
