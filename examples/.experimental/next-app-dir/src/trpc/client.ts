'use client';

import { loggerLink } from '@trpc/client';
import {
  experimental_createActionHook,
  experimental_serverActionLink,
} from '@trpc/next/app-dir/client';
import { experimental_createTRPCNextReactQuery } from '@trpc/next/app-dir/react';
import { AppRouter } from '~/server/routers/_app';
import superjson from 'superjson';

export const api = experimental_createTRPCNextReactQuery<AppRouter>({});

export const useAction = experimental_createActionHook({
  links: [loggerLink(), experimental_serverActionLink()],
  transformer: superjson,
});
