/* eslint-disable @typescript-eslint/no-non-null-assertion */

/* eslint-disable @typescript-eslint/no-explicit-any */
import type { AnyRouter } from '@trpc/server';
import {
  TRPCClient as Client,
  CreateTRPCClientOptions,
} from './internals/TRPCClient';
import { httpBatchLink } from './links';

/**
 * @deprecated use `createTRPCProxyClient` instead
 */
export function createTRPCClient<TRouter extends AnyRouter>(
  opts:
    | CreateTRPCClientOptions<TRouter>
    | {
        /**
         * @deprecated use `links` instead
         */
        url: string;
      },
) {
  const getLinks = () => {
    if ('links' in opts) {
      return opts.links;
    }
    return [httpBatchLink({ url: opts.url })];
  };
  const client = new Client<TRouter>({
    links: getLinks(),
  });
  return client;
}

// Also the client created above needs to somehow be like `TRPCClient<Router> & Omit<Router, 'createCaller' | 'createProcedure' | '_def' | 'transformer' | 'errorFormatter' | 'getErrorShape>`

export type {
  AssertLegacyDef,
  CreateTRPCClientOptions,
  TRPCClient,
} from './internals/TRPCClient';
