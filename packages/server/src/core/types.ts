import { inferObservableValue } from '../observable';
import { inferTransformedProcedureOutput } from '../shared/jsonify';
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
  inferRouterDef<TRouter>['_config']['$types']['ctx'];
export type inferRouterError<TRouter extends AnyRouter> =
  inferRouterDef<TRouter>['_config']['$types']['errorShape'];
export type inferRouterMeta<TRouter extends AnyRouter> =
  inferRouterDef<TRouter>['_config']['$types']['meta'];

export const procedureTypes = ['query', 'mutation', 'subscription'] as const;
/**
 * @public
 */
export type ProcedureType = (typeof procedureTypes)[number];

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

/**
 * @deprecated will be removed in next major as it's v9 stuff
 */
export type inferSubscriptionOutput<
  TRouter extends AnyRouter,
  TPath extends keyof TRouter['_def']['subscriptions'] & string,
> = inferObservableValue<
  inferProcedureOutput<TRouter['_def']['subscriptions'][TPath]>
>;

export type inferProcedureClientError<TProcedure extends AnyProcedure> =
  inferProcedureParams<TProcedure>['_config']['errorShape'];

type GetInferenceHelpers<
  TType extends 'input' | 'output',
  TRouter extends AnyRouter,
> = {
  [TKey in keyof TRouter['_def']['record']]: TRouter['_def']['record'][TKey] extends infer TRouterOrProcedure
    ? TRouterOrProcedure extends AnyRouter
      ? GetInferenceHelpers<TType, TRouterOrProcedure>
      : TRouterOrProcedure extends AnyProcedure
      ? TType extends 'input'
        ? inferProcedureInput<TRouterOrProcedure>
        : inferTransformedProcedureOutput<TRouterOrProcedure>
      : never
    : never;
};

export type inferRouterInputs<TRouter extends AnyRouter> = GetInferenceHelpers<
  'input',
  TRouter
>;

export type inferRouterOutputs<TRouter extends AnyRouter> = GetInferenceHelpers<
  'output',
  TRouter
>;
