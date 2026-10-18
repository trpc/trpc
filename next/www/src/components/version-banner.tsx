import { Link } from '@tanstack/react-router';
import { FlaskConical, History } from 'lucide-react';

import {
  counterpart,
  type DocsVersion,
  v11Docs,
  v12Docs,
} from '~/content/docs.ts';

const linkClass = 'font-medium text-link underline underline-offset-2';

/**
 * Which version the page is of, as Docusaurus's version banner says it, with
 * a link to the page on its topic in the version to read instead.
 */
export function VersionBanner(props: {
  readonly slug: string;
  readonly version: DocsVersion;
}) {
  const copied = props.version.copied;
  if (!copied) {
    const other = counterpart(props.version, props.slug, v11Docs);
    return (
      <aside className="mb-6 flex gap-2.5 rounded-lg border border-brand/30 bg-brand/5 px-3.5 py-2.5 text-sm text-pretty">
        <FlaskConical className="mt-0.5 size-4 shrink-0 text-link" />
        <p>
          This is the documentation for tRPC v12, which is experimental. For the
          stable release, see{' '}
          <Link
            className={linkClass}
            params={{ _splat: other?.slug ?? v11Docs.firstDoc }}
            to={v11Docs.route}
          >
            {other ? 'this page in v11' : 'the v11 docs'}
          </Link>
          .
        </p>
      </aside>
    );
  }
  const instead = copied.status === 'stable' ? v12Docs : v11Docs;
  const other = counterpart(props.version, props.slug, instead);
  return (
    <aside className="mb-6 flex gap-2.5 rounded-lg border bg-muted/50 px-3.5 py-2.5 text-sm text-pretty">
      <History className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
      <p>
        This is the documentation for tRPC {props.version.id},{' '}
        {copied.status === 'stable'
          ? 'the stable release'
          : 'which is no longer actively maintained'}
        , as{' '}
        <a className={linkClass} href={`${copied.url}${copied.trpcPath}`}>
          trpc.io
        </a>{' '}
        has it. For{' '}
        {copied.status === 'stable'
          ? 'the experimental v12'
          : 'the stable release'}
        , see{' '}
        <Link
          className={linkClass}
          params={{ _splat: other?.slug ?? instead.firstDoc }}
          to={instead.route}
        >
          {other ? `this page in ${instead.id}` : `the ${instead.id} docs`}
        </Link>
        .
      </p>
    </aside>
  );
}
