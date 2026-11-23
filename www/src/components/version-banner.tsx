import { Link } from '@tanstack/react-router';
import { History } from 'lucide-react';

import { counterpart, type DocsVersion, v11Docs } from '~/content/docs.ts';

const linkClass = 'font-medium text-link underline underline-offset-2';

/**
 * Which version the page is of, as Docusaurus's version banner says it, with
 * a link to the page on its topic in v11. The stable release's pages have
 * none.
 */
export function VersionBanner(props: {
  readonly slug: string;
  readonly version: DocsVersion;
}) {
  if (props.version.status === 'stable') {
    return null;
  }
  const other = counterpart(props.version, props.slug, v11Docs);
  return (
    <aside className="mb-6 flex gap-2.5 rounded-lg border bg-muted/50 px-3.5 py-2.5 text-sm text-pretty">
      <History className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
      <p>
        This is the documentation for tRPC {props.version.id}, which is no
        longer actively maintained. For the stable release, see{' '}
        <Link
          className={linkClass}
          params={{ _splat: other?.slug ?? v11Docs.firstDoc }}
          to={v11Docs.route}
        >
          {other ? `this page in ${v11Docs.id}` : `the ${v11Docs.id} docs`}
        </Link>
        .
      </p>
    </aside>
  );
}
