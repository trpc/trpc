import { Link } from '@tanstack/react-router';

import { cn } from '@shared/ui/lib/utils';

import { useDocsVersion } from '~/content/docs.ts';

export function DocsNav(props: { readonly onNavigate?: () => void }) {
  const version = useDocsVersion();
  return (
    <nav
      aria-label={`Documentation, ${version.id}`}
      className="grid gap-6 text-sm"
    >
      {version.sections.map((section) => (
        <div key={section.title}>
          {/* v11's sections are cased as trpc.io has them: "tRPC". */}
          <h2
            className={cn(
              'mb-2 px-2 text-xs font-semibold text-muted-foreground',
              version.id === 'v12' && 'tracking-wide uppercase',
            )}
          >
            {section.title}
          </h2>
          <ul className="grid gap-0.5">
            {section.docs.map((doc) => (
              <li key={doc.slug}>
                <Link
                  activeProps={{
                    'aria-current': 'page',
                    className:
                      'bg-brand/10 font-semibold text-link hover:bg-brand/15 hover:text-link',
                  }}
                  className="block rounded-md px-2 py-1.5 transition-colors"
                  inactiveProps={{
                    className:
                      'text-muted-foreground hover:bg-accent/60 hover:text-foreground',
                  }}
                  onClick={props.onNavigate}
                  params={{ _splat: doc.slug }}
                  to={version.route}
                >
                  {doc.label ?? doc.title}
                </Link>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </nav>
  );
}
