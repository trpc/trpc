import { AnyRouter } from '@trpc/server';
import {
  GenericTRPCClient as Client,
  CreateTRPCClientOptions,
} from './internals/GenericTRPCClient';
import { httpBatchLink } from './links';

export function createGenericTRPCClient<TRouter extends AnyRouter>(
  opts: CreateTRPCClientOptions<TRouter>,
) {
  const getLinks = () => {
    if ('links' in opts) {
      return opts.links;
    }
    return [httpBatchLink(opts)];
  };
  const client = new Client({
    ...opts,
    links: getLinks(),
  });
  return client;
}

export type {
  CreateTRPCClientOptions,
  GenericTRPCClient,
  TRPCRequestOptions,
} from './internals/GenericTRPCClient';
