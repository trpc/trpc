import {
  GenericTRPCClient as Client,
  CreateTRPCClientOptions,
} from './internals/GenericTRPCClient';
import { httpBatchLink } from './links';

export function createGenericTRPCClient(opts: CreateTRPCClientOptions) {
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
