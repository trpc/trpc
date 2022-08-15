import { inferObservableValue } from '../observable';
import { Procedure, ProcedureArgs } from './procedure';
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

/**
 * @public
 */
export type ProcedureTypeOrUnknown = ProcedureType | 'unknown';

export type inferHandlerInput<TProcedure extends Procedure<any>> =
  ProcedureArgs<inferProcedureParams<TProcedure>>;

export type inferProcedureInput<TProcedure extends Procedure<any>> =
  inferHandlerInput<TProcedure>[0];

// /**
//  * @internal
//  */
// type inferProcedureFn<TProcedure extends Procedure<any>> =
//   TProcedure extends QueryProcedure<any>
//     ? TProcedure['query']
//     : TProcedure extends SubscriptionProcedure<any>
//     ? TProcedure['subscription']
//     : TProcedure extends MutationProcedure<any>
//     ? TProcedure['mutate']
//     : never;

export type inferProcedureParams<TProcedure> = TProcedure extends Procedure<any>
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

export type inferProcedureClientError<T extends Procedure<any>> =
  inferProcedureParams<T>['_config']['errorShape'];
