import {
  BaseTRPCClient as Client,
  CreateTRPCClientOptions,
} from './internals/BaseTRPCClient';
import { httpBatchLink } from './links';

export function createBaseTRPCClient(opts: CreateTRPCClientOptions) {
  const getLinks = () => {
    if ('links' in opts) {
      return opts.links;
    }
    return [httpBatchLink(opts)];
  };
  const client = new Client({
    transformer: opts.transformer,
    links: getLinks(),
  });
  return client;
}

export type {
  CreateTRPCClientOptions,
  BaseTRPCClient,
  TRPCRequestOptions,
} from './internals/BaseTRPCClient';
