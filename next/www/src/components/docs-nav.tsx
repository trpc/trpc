import { Link } from '@tanstack/react-router';

import { sections } from '~/content/docs.ts';

export function DocsNav(props: { readonly onNavigate?: () => void }) {
  return (
    <nav aria-label="Documentation" className="grid gap-6 text-sm">
      {sections.map((section) => (
        <div key={section.title}>
          <h2 className="mb-2 px-2 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
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
                  to="/docs/$"
                >
                  {doc.title}
                </Link>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </nav>
  );
}
