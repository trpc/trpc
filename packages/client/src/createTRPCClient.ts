/* eslint-disable @typescript-eslint/naming-convention */
import type {
  AnyRouter,
  AsTransformer,
  ClientDataTransformerOptions,
  DataTransformer,
} from '@trpc/server';
import {
  TRPCClient as Client,
  CreateTRPCClientOptions,
} from './internals/TRPCClient';
import { httpBatchLink } from './links';

/**
 * @deprecated use `createTRPCProxyClient` instead
 */
export function createTRPCClient<
  TRouter extends AnyRouter,
  Transformer extends ClientDataTransformerOptions | undefined = undefined,
>(
  opts: CreateTRPCClientOptions<TRouter, Transformer>,
): Transformer extends undefined
  ? Client<TRouter, Transformer>
  : AsTransformer<Transformer> extends undefined
  ? Client<TRouter, Transformer>
  : AsTransformer<Transformer> extends DataTransformer
  ? Client<TRouter, Transformer>
  : never {
  const getLinks = () => {
    if ('links' in opts) {
      return opts.links;
    }
    return [httpBatchLink(opts)];
  };
  const client = new Client<TRouter, Transformer>({
    transformer: opts.transformer,
    links: getLinks(),
  });
  return client as any;
}

// Also the client created above needs to somehow be like `TRPCClient<Router> & Omit<Router, 'createCaller' | 'createProcedure' | '_def' | 'transformer' | 'errorFormatter' | 'getErrorShape>`

export type {
  CreateTRPCClientOptions,
  TRPCClient,
  TRPCRequestOptions,
} from './internals/TRPCClient';
