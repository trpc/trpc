import type { QueryClient } from '@tanstack/react-query';
import { ReactQueryDevtools } from '@tanstack/react-query-devtools';
import {
  createRootRouteWithContext,
  Link,
  Outlet,
  ScrollRestoration,
} from '@tanstack/react-router';
import { TanStackRouterDevtools } from '@tanstack/router-devtools';
import { Body, Head, Html, Meta, Scripts } from '@tanstack/start';
import { createServerSideHelpers } from '@trpc/react-query/server';
import appCss from '~/app.css?url';
import { DefaultCatchBoundary } from '~/components/DefaultCatchBoundary';
import { NotFound } from '~/components/NotFound';
import { TRPCRouter } from '~/trpc/router';
import * as React from 'react';

export const Route = createRootRouteWithContext<{
  queryClient: QueryClient;
  trpc: ReturnType<typeof createServerSideHelpers<TRPCRouter>>;
}>()({
  meta: () => [
    { charSet: 'utf-8' },
    { name: 'viewport', content: 'width=device-width, initial-scale=1' },
  ],
  links: () => [{ rel: 'stylesheet', href: appCss }],
  errorComponent: (props) => {
    return (
      <RootDocument>
        <DefaultCatchBoundary {...props} />
      </RootDocument>
    );
  },
  notFoundComponent: () => <NotFound />,
  component: () => (
    <RootDocument>
      <Outlet />
    </RootDocument>
  ),
});

function RootDocument(props: Readonly<{ children: React.ReactNode }>) {
  return (
    <Html>
      <Head>
        <Meta />
      </Head>
      <Body>
        <div className="flex gap-2 p-2 text-lg">
          <Link
            to="/"
            activeProps={{
              className: 'font-bold',
            }}
            activeOptions={{ exact: true }}
          >
            Home
          </Link>{' '}
          <Link
            to={'/posts'}
            activeProps={{
              className: 'font-bold',
            }}
          >
            Posts
          </Link>
          <Link
            // @ts-expect-error - typesafe routing
            to="/this-route-does-not-exist"
            activeProps={{
              className: 'font-bold',
            }}
          >
            This Route Does Not Exist
          </Link>
        </div>
        <hr />
        {props.children}
        <ScrollRestoration />
        <TanStackRouterDevtools position="bottom-right" />
        <ReactQueryDevtools buttonPosition="bottom-left" />
        <Scripts />
      </Body>
    </Html>
  );
}
