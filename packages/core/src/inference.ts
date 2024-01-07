import { inferObservableValue } from './observable';
import { AnyProcedure, ProcedureArgs } from './procedure';
import { AnyRouter, AnyRouterDef, Router } from './router';
import { Serialize } from './shared/serialize';
import { DefaultDataTransformer } from './transformer';
import { AnyRootConfig } from './trpcConfig';

/**
 * @internal
 */
export type inferTransformedProcedureOutput<
  TConfig extends AnyRootConfig,
  TProcedure extends AnyProcedure,
> = TConfig['transformer'] extends DefaultDataTransformer
  ? Serialize<TProcedure['_def']['_output_out']>
  : TProcedure['_def']['_output_out'];

/**
 * @internal
 */
export type inferTransformedSubscriptionOutput<
  TConfig extends AnyRootConfig,
  TProcedure extends AnyProcedure,
> = TConfig['transformer'] extends DefaultDataTransformer
  ? Serialize<inferObservableValue<TProcedure['_def']['_output_out']>>
  : inferObservableValue<TProcedure['_def']['_output_out']>;

export type inferRouterDef<TRouter extends AnyRouter> = TRouter extends Router<
  infer TParams
>
  ? TParams extends AnyRouterDef<any>
    ? TParams
    : never
  : never;

export type inferRouterConfig<TRouter extends AnyRouter> =
  inferRouterDef<TRouter>['_config'];
export type inferRouterContext<TRouter extends AnyRouter> =
  inferRouterConfig<TRouter>['$types']['ctx'];
export type inferRouterError<TRouter extends AnyRouter> =
  inferRouterConfig<TRouter>['$types']['errorShape'];
export type inferRouterMeta<TRouter extends AnyRouter> =
  inferRouterConfig<TRouter>['$types']['meta'];

export type inferHandlerInput<TProcedure extends AnyProcedure> = ProcedureArgs<
  inferProcedureParams<TProcedure>
>;

export type inferProcedureInput<TProcedure extends AnyProcedure> =
  inferProcedureParams<TProcedure>['_input_in'];

export type inferProcedureParams<TProcedure> = TProcedure extends AnyProcedure
  ? TProcedure['_def']
  : never;
export type inferProcedureOutput<TProcedure> =
  inferProcedureParams<TProcedure>['_output_out'];

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
        : inferTransformedProcedureOutput<
            TRouter['_def']['_config'],
            TRouterOrProcedure
          >
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

export type TRPCInferrable = AnyRouter | AnyRootConfig;
export type inferConfig<TInferrable extends TRPCInferrable> =
  TInferrable extends AnyRouter ? TInferrable['_def']['_config'] : TInferrable;

export type inferErrorShape<TInferrable extends TRPCInferrable> =
  inferConfig<TInferrable>['$types']['errorShape'];
