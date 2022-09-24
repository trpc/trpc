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
  opts: CreateTRPCClientOptions<TRouter>,
) {
  const getLinks = () => {
    if ('links' in opts) {
      return opts.links;
    }
    return [httpBatchLink(opts)];
  };
  const client = new Client<TRouter>({
    transformer: opts.transformer,
    links: getLinks(),
  });
  return client;
}

// Also the client created above needs to somehow be like `TRPCClient<Router> & Omit<Router, 'createCaller' | 'createProcedure' | '_def' | 'transformer' | 'errorFormatter' | 'getErrorShape>`

export type {
  CreateTRPCClientOptions,
  TRPCClient,
  TRPCRequestOptions,
} from './internals/TRPCClient';
