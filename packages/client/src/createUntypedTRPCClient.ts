import { AnyRouter } from '@trpc/server';
import {
  CreateTRPCClientOptions,
  UntypedTRPCClient,
} from './internals/UntypedTRPCClient';
import { httpBatchLink } from './links';

export function createUntypedTRPCClient<TRouter extends AnyRouter>(
  opts: CreateTRPCClientOptions<TRouter>,
) {
  const getLinks = () => {
    if ('links' in opts) {
      return opts.links;
    }
    return [httpBatchLink(opts)];
  };
  const client = new UntypedTRPCClient({
    ...opts,
    links: getLinks(),
  });
  return client;
}

export type {
  CreateTRPCClientOptions,
  UntypedTRPCClient,
  TRPCRequestOptions,
} from './internals/UntypedTRPCClient';
