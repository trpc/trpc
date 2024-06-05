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

type Voidable<TArg1, TRest extends unknown[]> = [input?: TArg1, ...rest: TRest];

/**
 * Returns true if any of the types are `true`
 */
type OR<T extends unknown[]> = T extends [infer $First, ...infer $Rest]
  ? $First extends true
    ? true
    : OR<$Rest>
  : false;
type Not<T extends boolean> = T extends true ? false : true;
const inferenceSecret = Symbol('secret');
type InferenceSecret = typeof inferenceSecret;

type IsNever<T> = [T] extends [never] ? true : false;
type IsAny<T> = [T] extends [InferenceSecret] ? Not<IsNever<T>> : false;
type IsUnknown<T> = [unknown] extends [T] ? Not<IsAny<T>> : false;

/**
 * Infer the arguments of a resolver
 */
export type inferResolverArgs<TInput, TRestArgs extends unknown[]> = OR<
  [
    //
    IsAny<TInput>,
    IsUnknown<TInput>,
    undefined extends TInput ? true : false,
  ]
> extends true
  ? Voidable<TInput, TRestArgs>
  : [input: TInput, ...rest: TRestArgs];
