import type { inferObservableValue } from '../../observable/index.ts';
import type { AnyProcedure, inferProcedureInput } from '../procedure.ts';
import type { AnyRouter, RouterRecord } from '../router.ts';
import type {
  AnyClientTypes,
  inferClientTypes,
  InferrableClientTypes,
} from './inferrable.ts';
import type { Serialize } from './serialize.ts';

/**
 * @internal
 */

export type inferTransformedProcedureOutput<
  TInferrable extends InferrableClientTypes,
  TProcedure extends AnyProcedure,
> = inferClientTypes<TInferrable>['transformer'] extends false
  ? Serialize<TProcedure['_def']['_output_out']>
  : TProcedure['_def']['_output_out'];
/** @internal */

export type inferTransformedSubscriptionOutput<
  TInferrable extends InferrableClientTypes,
  TProcedure extends AnyProcedure,
> = inferClientTypes<TInferrable>['transformer'] extends false
  ? Serialize<inferObservableValue<TProcedure['_def']['_output_out']>>
  : inferObservableValue<TProcedure['_def']['_output_out']>;

export type GetInferenceHelpers<
  TType extends 'input' | 'output',
  TRoot extends AnyClientTypes,
  TRecord extends RouterRecord,
> = {
  [TKey in keyof TRecord]: TRecord[TKey] extends infer $Value
    ? $Value extends RouterRecord
      ? GetInferenceHelpers<TType, TRoot, $Value>
      : $Value extends AnyProcedure
      ? TType extends 'input'
        ? inferProcedureInput<$Value>
        : inferTransformedProcedureOutput<TRoot, $Value>
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
