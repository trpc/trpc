import { inferObservableValue } from '../observable';
import { AnyProcedure, ProcedureArgs } from './procedure';
import { AnyRouter, AnyRouterDef, Router } from './router';

export type inferRouterDef<TRouter extends AnyRouter> = TRouter extends Router<
  infer TParams
>
  ? TParams extends AnyRouterDef<any>
    ? TParams
    : never
  : never;

export type inferRouterContext<TRouter extends AnyRouter> =
  inferRouterDef<TRouter>['_ctx'];
export type inferRouterError<TRouter extends AnyRouter> =
  inferRouterDef<TRouter>['_errorShape'];
export type inferRouterMeta<TRouter extends AnyRouter> =
  inferRouterDef<TRouter>['_meta'];

export const procedureTypes = ['query', 'mutation', 'subscription'] as const;
/**
 * @public
 */
export type ProcedureType = typeof procedureTypes[number];

export type inferHandlerInput<TProcedure extends AnyProcedure> = ProcedureArgs<
  inferProcedureParams<TProcedure>
>;

export type inferProcedureInput<TProcedure extends AnyProcedure> =
  inferHandlerInput<TProcedure>[0];

export type inferProcedureParams<TProcedure> = TProcedure extends AnyProcedure
  ? TProcedure['_def']
  : never;
export type inferProcedureOutput<TProcedure> =
  inferProcedureParams<TProcedure>['_output_out'];

export type inferSubscriptionOutput<
  TRouter extends AnyRouter,
  TPath extends keyof TRouter['_def']['subscriptions'] & string,
> = inferObservableValue<
  inferProcedureOutput<TRouter['_def']['subscriptions'][TPath]>
>;

export type inferProcedureClientError<TProcedure extends AnyProcedure> =
  inferProcedureParams<TProcedure>['_config']['errorShape'];
