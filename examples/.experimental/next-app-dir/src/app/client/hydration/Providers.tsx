'use client';

import type { DehydratedState } from '@tanstack/react-query';
import {
  HydrationBoundary,
  QueryClientProvider,
} from '@tanstack/react-query';
import { ReactQueryDevtools } from '@tanstack/react-query-devtools';
import { useState, type ReactNode } from 'react';
import { api } from '~/trpc/client';
import { createTRPCReact } from "@trpc/react-query";
import type { AppRouter } from '~/server/routers/_app';
import { getQueryClient, getTrpcClient } from './getTrpcClient';

type Props = {
  children: ReactNode;
  dehydrateState?: DehydratedState;
};


export const trpc = createTRPCReact<AppRouter>({});

const Providers = (props: {
  children: ReactNode;
  dehydrateState?: DehydratedState;
}) => {

  const hydratedState = trpc.useDehydratedState(
    getTrpcClient(),
    props.dehydrateState,
  );

  return (
    <trpc.Provider client={getTrpcClient()} queryClient={getQueryClient()}>
      <QueryClientProvider client={getQueryClient()}>
        <HydrationBoundary state={hydratedState}>
          {props.children}
        </HydrationBoundary>
        <ReactQueryDevtools initialIsOpen={false} />
      </QueryClientProvider>
    </trpc.Provider>
  );
};

export default Providers;
