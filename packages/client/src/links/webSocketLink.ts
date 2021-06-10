import { AnyRouter } from '@trpc/server';
import { TRPCClientError } from '../createTRPCClient';
import { httpRequest } from '../internals/httpRequest';
import { HttpLinkOptions, TRPCLink } from './core';

export function webSocketLink<TRouter extends AnyRouter>(
  opts: HttpLinkOptions,
): TRPCLink<TRouter> {
  const { url } = opts;

  // initialized config
  return (runtime) => {
    // connect to WSS
    return ({ op, prev, onDestroy }) => {
      // do request and pass back
    };
  };
}
