import type { inferObservableValue } from '../../observable';
import type {
  AnyProcedure,
  inferProcedureInput,
  inferProcedureOutput,
} from '../procedure';
import type { AnyRouter, RouterRecord } from '../router';
import type {
  AnyClientTypes,
  inferClientTypes,
  InferrableClientTypes,
} from './inferrable';
import type { Serialize } from './serialize';

/**
 * @internal
 */

export type inferTransformedProcedureOutput<
  TInferrable extends InferrableClientTypes,
  TProcedure extends AnyProcedure,
> = inferClientTypes<TInferrable>['transformer'] extends false
  ? Serialize<inferProcedureOutput<TProcedure>>
  : inferProcedureOutput<TProcedure>;
/** @internal */

export type inferTransformedSubscriptionOutput<
  TInferrable extends InferrableClientTypes,
  TProcedure extends AnyProcedure,
> = inferClientTypes<TInferrable>['transformer'] extends false
  ? Serialize<inferObservableValue<inferProcedureOutput<TProcedure>>>
  : inferObservableValue<inferProcedureOutput<TProcedure>>;

export type GetInferenceHelpers<
  TType extends 'input' | 'output',
  TRoot extends AnyClientTypes,
  TRecord extends RouterRecord,
> = {
  [TKey in keyof TRecord]: TRecord[TKey] extends infer $Value
    ? $Value extends AnyProcedure
      ? TType extends 'input'
        ? inferProcedureInput<$Value>
        : inferTransformedProcedureOutput<TRoot, $Value>
      : $Value extends RouterRecord
        ? GetInferenceHelpers<TType, TRoot, $Value>
        : never
    : never;
};

export type inferRouterInputs<TRouter extends AnyRouter> = GetInferenceHelpers<
  'input',
  TRouter['_def']['_config']['$types'],
  TRouter['_def']['record']
>;

export type inferRouterOutputs<TRouter extends AnyRouter> = GetInferenceHelpers<
  'output',
  TRouter['_def']['_config']['$types'],
  TRouter['_def']['record']
>;
