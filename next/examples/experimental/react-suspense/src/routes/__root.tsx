import {
  createRootRouteWithContext,
  HeadContent,
  Outlet,
  Scripts,
} from '@tanstack/react-router';
import type { ReactNode } from 'react';
import type { Trpc } from '../trpc.ts';
import appCss from '../styles.css?url';

export const Route = createRootRouteWithContext<{ trpc: Trpc }>()({
  head: () => ({
    meta: [
      { charSet: 'utf-8' },
      { name: 'viewport', content: 'width=device-width, initial-scale=1' },
      { title: 'tRPC: use() and Suspense on TanStack Start' },
    ],
    links: [
      { rel: 'stylesheet', href: appCss },
      { rel: 'icon', href: 'data:,' },
    ],
  }),
  component: Outlet,
  shellComponent: Document,
});

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
