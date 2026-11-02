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
 * A procedure's output as the client gets it: as is with a transformer,
 * or as it comes out of JSON without one.
 * @internal
 */
export type inferTransformedProcedureOutput<
  TInferrable extends InferrableClientTypes,
  TProcedure extends AnyProcedure,
> = inferClientTypes<TInferrable>['transformer'] extends false
  ? Serialize<inferProcedureOutput<TProcedure>>
  : inferProcedureOutput<TProcedure>;

/**
 * The error shape a procedure's errors have: its own `.errors()` shape if
 * it has one, or else the router's.
 * @internal
 */
export type inferProcedureErrorShape<
  TInferrable extends InferrableClientTypes,
  TProcedure extends AnyProcedure,
> = TProcedure['_def']['$types']['errorShape'] extends infer $Shape
  ? unknown extends $Shape
    ? inferClientTypes<TInferrable>['errorShape']
    : $Shape
  : never;

/**
 * A subscription's events as the client gets them.
 * @internal
 */
export type inferTransformedSubscriptionOutput<
  TInferrable extends InferrableClientTypes,
  TProcedure extends AnyProcedure,
> = inferClientTypes<TInferrable>['transformer'] extends false
  ? Serialize<inferObservableValue<inferProcedureOutput<TProcedure>>>
  : inferObservableValue<inferProcedureOutput<TProcedure>>;

/** @internal */
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

/**
 * The input types of every procedure in a router, by path.
 * @example
 * ```ts
 * type PostByIdInput = inferRouterInputs<AppRouter>['post']['byId'];
 * ```
 * @see https://trpc.io/docs/client/vanilla/infer-types#inferring-input--output-types
 */
export type inferRouterInputs<TRouter extends AnyRouter> = GetInferenceHelpers<
  'input',
  TRouter['_def']['_config']['$types'],
  TRouter['_def']['record']
>;

/**
 * The output types of every procedure in a router, by path, as the client
 * gets them.
 * @see https://trpc.io/docs/client/vanilla/infer-types#inferring-input--output-types
 */
export type inferRouterOutputs<TRouter extends AnyRouter> = GetInferenceHelpers<
  'output',
  TRouter['_def']['_config']['$types'],
  TRouter['_def']['record']
>;
