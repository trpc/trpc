import type { inferObservableValue } from '@trpc/server/observable';
import type { AnyProcedure } from '../procedure';
import type { ClientInferrable, inferRootTypes } from './inferrable';
import type { Serialize } from './serialize';

/**
 * @internal
 */

export type inferTransformedProcedureOutput<
  TInferrable extends ClientInferrable,
  TProcedure extends AnyProcedure,
> = inferRootTypes<TInferrable>['transformer'] extends false
  ? Serialize<TProcedure['_def']['_output_out']>
  : TProcedure['_def']['_output_out'];
/** @internal */

export type inferTransformedSubscriptionOutput<
  TInferrable extends ClientInferrable,
  TProcedure extends AnyProcedure,
> = inferRootTypes<TInferrable>['transformer'] extends false
  ? Serialize<inferObservableValue<TProcedure['_def']['_output_out']>>
  : inferObservableValue<TProcedure['_def']['_output_out']>;

export type inferProcedureInput<TProcedure extends AnyProcedure> =
  undefined extends inferProcedureParams<TProcedure>['_input_in']
    ? void | inferProcedureParams<TProcedure>['_input_in']
    : inferProcedureParams<TProcedure>['_input_in'];

export type inferProcedureParams<TProcedure> = TProcedure extends AnyProcedure
  ? TProcedure['_def']
  : never;
export type inferProcedureOutput<TProcedure> =
  inferProcedureParams<TProcedure>['_output_out'];
