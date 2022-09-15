/* eslint-disable @typescript-eslint/no-non-null-assertion */

/* eslint-disable @typescript-eslint/no-explicit-any */
import type { AnyRouter, ClientDataTransformerOptions } from '@trpc/server';
import {
  TRPCClient as Client,
  CreateTRPCClientOptions,
} from './internals/TRPCClient';
import { httpBatchLink } from './links';
import { HTTPLinkOptions } from './links/internals/httpUtils';

/**
 * @deprecated use `createTRPCProxyClient` instead
 */
export function createTRPCClient<TRouter extends AnyRouter>(
  opts:
    | CreateTRPCClientOptions<TRouter>
    | {
        transformer?: ClientDataTransformerOptions;
        /**
         * @deprecated use `links` instead
         */
        url: string;
        /**
         * @deprecated use `links` instead
         */
        headers?: HTTPLinkOptions['headers'];
        /**
         * @deprecated use `links` instead
         */
        fetch?: HTTPLinkOptions['fetch'];
        /**
         * @deprecated use `links` instead
         */
        AbortController?: HTTPLinkOptions['AbortController'];
      },
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
