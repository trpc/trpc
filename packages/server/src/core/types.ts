import { inferObservableValue } from '../observable';
import { inferAsyncReturnType } from '../types';
import { Procedure, ProcedureArgs } from './procedure';
import { AnyRouter, AnyRouterParams, Router } from './router';

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
export type inferRouterMeta<TRouter extends AnyRouter> =
  inferRouterParams<TRouter>['_meta'];

/**
 * @public
 */
export type ProcedureType = 'query' | 'mutation' | 'subscription';

export type inferHandlerInput<TProcedure extends Procedure<any>> =
  TProcedure extends Procedure<infer TParams> ? ProcedureArgs<TParams> : never;

export type inferProcedureInput<TProcedure extends Procedure<any>> =
  inferHandlerInput<TProcedure>[0];

export type inferProcedureOutput<TProcedure extends Procedure<any>> =
  inferAsyncReturnType<TProcedure>;

export type inferSubscriptionOutput<
  TRouter extends AnyRouter,
  TPath extends keyof TRouter['subscriptions'] & string,
> = inferObservableValue<inferProcedureOutput<TRouter['subscriptions'][TPath]>>;
