import { AnyRouter } from '@trpc/server';
import {
  CreateTRPCClientOptions,
  TRPCUntypedClient,
} from './internals/TRPCUntypedClient';
import { httpBatchLink } from './links';

export function createTRPCUntypedClient<TRouter extends AnyRouter>(
  opts: CreateTRPCClientOptions<TRouter>,
) {
  const getLinks = () => {
    if ('links' in opts) {
      return opts.links;
    }
    return [httpBatchLink(opts)];
  };
  const client = new TRPCUntypedClient({
    ...opts,
    links: getLinks(),
  });
  return client;
}

export type {
  CreateTRPCClientOptions,
  TRPCUntypedClient,
  TRPCRequestOptions,
} from './internals/TRPCUntypedClient';
