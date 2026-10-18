import { RegistryContext } from '@effect/atom-react';
import {
  createRootRouteWithContext,
  HeadContent,
  Outlet,
  Scripts,
} from '@tanstack/react-router';
import type { ReactNode } from 'react';
import type { Atoms } from '../trpc.ts';
import appCss from '../styles.css?url';

export const Route = createRootRouteWithContext<{ atoms: Atoms }>()({
  head: () => ({
    meta: [
      { charSet: 'utf-8' },
      { name: 'viewport', content: 'width=device-width, initial-scale=1' },
      { title: 'tRPC: Effect atoms on TanStack Start' },
    ],
    links: [
      { rel: 'stylesheet', href: appCss },
      { rel: 'icon', href: 'data:,' },
    ],
  }),
  component: Root,
  shellComponent: Document,
});

function Root() {
  const registry = Route.useRouteContext({
    select: (context) => context.atoms.registry,
  });
  return (
    <RegistryContext.Provider value={registry}>
      <Outlet />
    </RegistryContext.Provider>
  );
}

function Document(props: { children: ReactNode }) {
  return (
    <html lang="en">
      <head>
        <HeadContent />
      </head>
      <body className="bg-background text-foreground antialiased">
        {props.children}
        <Scripts />
      </body>
    </html>
  );
}
