import type { AnyProcedure } from '../core';
import type { inferObservableValue } from '../observable';
import type { DefaultDataTransformer } from '../transformer';
import type { Serialize } from './internal/serialize';

/**
 * @internal
 */
export type inferTransformedProcedureOutput<TProcedure extends AnyProcedure> =
  TProcedure['_def']['_config']['transformer'] extends DefaultDataTransformer
    ? Serialize<TProcedure['_def']['_output_out']>
    : TProcedure['_def']['_output_out'];

export type inferTransformedSubscriptionOutput<
  TProcedure extends AnyProcedure,
> = TProcedure['_def']['_config']['transformer'] extends DefaultDataTransformer
  ? Serialize<inferObservableValue<TProcedure['_def']['_output_out']>>
  : inferObservableValue<TProcedure['_def']['_output_out']>;
