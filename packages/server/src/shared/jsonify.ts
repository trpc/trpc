import type { AnyProcedure, inferProcedureOutput } from '../core';
import type { inferObservableValue } from '../observable';
import type { DefaultDataTransformer } from '../transformer';
import type { Serialize } from './internal/serialize';

/**
 * @internal
 */
export type inferTransformedProcedureOutput<TProcedure extends AnyProcedure, TInput = any> =
  TProcedure['_def']['_config']['transformer'] extends DefaultDataTransformer
    ? Serialize<inferProcedureOutput<TProcedure, TInput>>
    : inferProcedureOutput<TProcedure, TInput>;

export type inferTransformedSubscriptionOutput<
  TProcedure extends AnyProcedure,
  TInput
> = TProcedure['_def']['_config']['transformer'] extends DefaultDataTransformer
  ? Serialize<inferObservableValue<inferProcedureOutput<TProcedure, TInput>>>
  : inferObservableValue<inferProcedureOutput<TProcedure, TInput>>;
