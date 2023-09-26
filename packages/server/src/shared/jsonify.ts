import { AnyProcedure } from '../core';
import { AnyRootConfig } from '../core/internals/config';
import { inferObservableValue } from '../observable';
import { DefaultDataTransformer } from '../transformer';
import type { Serialize } from './internal/serialize';

/**
 * @internal
 */
export type inferTransformedProcedureOutput<
  TConfig extends AnyRootConfig,
  TProcedure extends AnyProcedure,
> = TConfig['transformer'] extends DefaultDataTransformer
  ? Serialize<TProcedure['_def']['_output_out']>
  : TProcedure['_def']['_output_out'];

export type inferTransformedSubscriptionOutput<
  TConfig extends AnyRootConfig,
  TProcedure extends AnyProcedure,
> = TConfig['transformer'] extends DefaultDataTransformer
  ? Serialize<inferObservableValue<TProcedure['_def']['_output_out']>>
  : inferObservableValue<TProcedure['_def']['_output_out']>;
