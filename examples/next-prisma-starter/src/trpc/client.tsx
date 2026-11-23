'use client';

import type { QueryClient } from '@tanstack/react-query';
import { QueryClientProvider } from '@tanstack/react-query';
import {
  createTRPCClient,
  httpBatchStreamLink,
  loggerLink,
} from '@trpc/client';
import type { inferRouterInputs, inferRouterOutputs } from '@trpc/server';
import type { TRPCOptionsProxy } from '@trpc/tanstack-react-query';
import { createTRPCContext } from '@trpc/tanstack-react-query';
import type { ReactNode } from 'react';
import { useState } from 'react';
// ℹ️ Type-only import:
// https://www.typescriptlang.org/docs/handbook/release-notes/typescript-3-8.html#type-only-imports-and-export
import type { AppRouter } from '~/server/routers/_app';
import { transformer } from '~/utils/transformer';
import { makeQueryClient } from './query-client';

/**
 * A provider and a strongly-typed `useTRPC()` hook from your `AppRouter` type signature
 * @see https://trpc.io/docs/v11/client/nextjs/app-router-setup#5-create-a-trpc-client-for-client-components
 */
export const { TRPCProvider, useTRPC } = createTRPCContext<AppRouter>();

/**
 * Types the query handles that pages pass to client components
 * @see https://trpc.io/docs/v11/client/tanstack-react-query/handles#typing-props
 */
export type TRPC = TRPCOptionsProxy<AppRouter>;

export type RouterInput = inferRouterInputs<AppRouter>;
export type RouterOutput = inferRouterOutputs<AppRouter>;

let browserQueryClient: QueryClient | undefined;
function getQueryClient() {
  if (typeof window === 'undefined') {
    // Server: always make a new query client
    return makeQueryClient();
  }
  // Browser: reuse the client so it survives React suspending the initial render
  return (browserQueryClient ??= makeQueryClient());
}

function getBaseUrl() {
  if (typeof window !== 'undefined') {
    return '';
  }
  // reference for vercel.com
  if (process.env.VERCEL_URL) {
    return `https://${process.env.VERCEL_URL}`;
  }

  // // reference for render.com
  if (process.env.RENDER_INTERNAL_HOSTNAME) {
    return `http://${process.env.RENDER_INTERNAL_HOSTNAME}:${process.env.PORT}`;
  }

  // assume localhost
  return `http://127.0.0.1:${process.env.PORT ?? 3000}`;
}

export function TRPCReactProvider(props: { children: ReactNode }) {
  const queryClient = getQueryClient();
  const [trpcClient] = useState(() =>
    createTRPCClient<AppRouter>({
      /**
       * @see https://trpc.io/docs/v11/client/links
       */
      links: [
        // adds pretty logs to your console in development and logs errors in production
        loggerLink({
          enabled: (opts) =>
            process.env.NODE_ENV === 'development' ||
            (opts.direction === 'down' && opts.result instanceof Error),
        }),
        httpBatchStreamLink({
          url: `${getBaseUrl()}/api/trpc`,
          /**
           * @see https://trpc.io/docs/v11/data-transformers
           */
          transformer,
        }),
      ],
    }),
  );

  return (
    <QueryClientProvider client={queryClient}>
      <TRPCProvider trpcClient={trpcClient} queryClient={queryClient}>
        {props.children}
      </TRPCProvider>
    </QueryClientProvider>
  );
}
