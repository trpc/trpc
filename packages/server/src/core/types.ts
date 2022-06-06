import { AnyRouter, AnyRouterParams, Router } from './router';

/**
 *
 */
export type inferRouterParams<TRouter extends AnyRouter> =
  TRouter extends Router<infer TParams>
    ? TParams extends AnyRouterParams<any>
      ? TParams
      : never
    : never;

export type inferRouterContext<TRouter extends AnyRouter> =
  inferRouterParams<TRouter>['_ctx'];
export type inferRouterError<TRouter extends AnyRouter> =
  inferRouterParams<TRouter>['_errorShape'];

/**
 * @public
 */
export type ProcedureType = 'query' | 'mutation' | 'subscription';
