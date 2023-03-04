import { AnyRouter, callProcedure, inferRouterContext } from '@trpc/server';
import { observable } from '@trpc/server/observable';
import { TRPCClientError } from '../TRPCClientError';
import { TRPCLink } from './types';

type SSRLinkOptions<TRouter extends AnyRouter> = {
  router: TRouter;
  createContext: () => Promise<inferRouterContext<TRouter>>;
};

export function ssrLink<TRouter extends AnyRouter>(
  opts: SSRLinkOptions<TRouter>,
): TRPCLink<TRouter> {
  return () =>
    ({ op }) =>
      observable((observer) => {
        const { path, input, type } = op;

        const contextPromise = opts.createContext();

        const promise = contextPromise
          .then((ctx) => {
            const promise = callProcedure({
              procedures: opts.router._def.procedures,
              path,
              rawInput: input,
              ctx: ctx,
              type,
            });

            return promise;
          })
          .catch((cause) => observer.error(TRPCClientError.from(cause)));

        promise
          .then((data) => {
            observer.next({ result: { data } });
            observer.complete();
          })
          .catch((cause) => observer.error(TRPCClientError.from(cause)));
      });
}
