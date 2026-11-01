import type { QueryClient } from '@tanstack/react-query';
import { HydrationBoundary } from '@tanstack/react-query';
import * as React from 'react';
import { dehydrateUnsent } from './hydration';
import { unwrapLazyArg } from './utils';

export interface unstable_HydrateClientProps {
  children?: React.ReactNode;
}

/**
 * Create a `HydrateClient` server component for the request's `QueryClient`.
 * It sends the queries started so far in this request to the browser,
 * pending ones as promises that stream in as they settle. A query an earlier
 * `HydrateClient` already sent is skipped, so nesting them is fine.
 *
 * React Server Components only: the package resolves to the server build
 * through the `react-server` export condition.
 *
 * @see https://trpc.io/docs/client/tanstack-react-query/handles#hydrate-client
 */
export function unstable_createHydrateClient(
  _queryClient: QueryClient | (() => QueryClient),
): React.FC<unstable_HydrateClientProps> {
  function HydrateClient(): React.ReactNode {
    throw new Error(
      '`HydrateClient` from `unstable_createHydrateClient()` works only in React Server Components. ' +
        "Render it from a server component; in client components, use TanStack Query's `HydrationBoundary`.",
    );
  }
  return HydrateClient;
}

/**
 * `unstable_createHydrateClient` for the `react-server` export condition.
 * @internal
 */
export function createHydrateClientReactServer(
  queryClient: QueryClient | (() => QueryClient),
): React.FC<unstable_HydrateClientProps> {
  function HydrateClient(props: unstable_HydrateClientProps) {
    return (
      <HydrationBoundary state={dehydrateUnsent(unwrapLazyArg(queryClient))}>
        {props.children}
      </HydrationBoundary>
    );
  }
  return HydrateClient;
}
