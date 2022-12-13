import type { AnyRouter } from '@trpc/server';
import {
  BaseTRPCClient as Client,
  CreateTRPCClientOptions,
} from './internals/BaseTRPCClient';
import { httpBatchLink } from './links';

export function createBaseTRPCClient<TRouter extends AnyRouter>(
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
  BaseTRPCClient,
  TRPCRequestOptions,
} from './internals/BaseTRPCClient';
