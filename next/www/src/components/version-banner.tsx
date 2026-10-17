import { Link } from '@tanstack/react-router';
import { FlaskConical, History } from 'lucide-react';

import {
  counterpart,
  type DocsVersion,
  v11Docs,
  v12Docs,
} from '~/content/docs.ts';
import { v11 } from '~/site.ts';

const linkClass = 'font-medium text-link underline underline-offset-2';

/**
 * Which version the page is of, as Docusaurus's version banner says it, with
 * a link to the page on its topic in the other version.
 */
export function VersionBanner(props: {
  readonly slug: string;
  readonly version: DocsVersion;
}) {
  const other = counterpart(props.version, props.slug);
  if (props.version.id === 'v12') {
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
  return (
    <aside className="mb-6 flex gap-2.5 rounded-lg border bg-muted/50 px-3.5 py-2.5 text-sm text-pretty">
      <History className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
      <p>
        This is the documentation for tRPC v11, the stable release, as{' '}
        <a className={linkClass} href={`${v11.url}/docs`}>
          trpc.io
        </a>{' '}
        has it. For the experimental v12, see{' '}
        <Link
          className={linkClass}
          params={{ _splat: other?.slug ?? v12Docs.firstDoc }}
          to={v12Docs.route}
        >
          {other ? 'this page in v12' : 'the v12 docs'}
        </Link>
        .
      </p>
    </aside>
  );
}
