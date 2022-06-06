import { inferObservableValue } from '../observable';
import { inferAsyncReturnType } from '../types';
import { UnsetMarker } from './internals/utils';
import { Procedure, ProcedureOptions } from './procedure';
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

/**
 * @public
 */
export type ProcedureType = 'query' | 'mutation' | 'subscription';

export type inferHandlerInput<TProcedure extends Procedure<any>> =
  TProcedure extends Procedure<infer TParams>
    ? TParams['_input_in'] extends UnsetMarker
      ? [input?: undefined | null, opts?: ProcedureOptions]
      : TParams['_input_in'] extends undefined
      ? [input?: TParams['_input_in'], opts?: ProcedureOptions]
      : [input: TParams['_input_in'], opts?: ProcedureOptions]
    : never;

export type inferProcedureInput<TProcedure extends Procedure<any>> =
  inferHandlerInput<TProcedure>[0];

export type inferProcedureOutput<TProcedure extends Procedure<any>> =
  inferAsyncReturnType<TProcedure>;

export type inferSubscriptionOutput<
  TRouter extends AnyRouter,
  TPath extends keyof TRouter['subscriptions'] & string,
> = inferObservableValue<inferProcedureOutput<TRouter['subscriptions'][TPath]>>;
