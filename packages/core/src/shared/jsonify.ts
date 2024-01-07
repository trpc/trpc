import { AnyRootConfig } from '../internals/config';
import { inferObservableValue } from '../observable';
import { AnyProcedure } from '../procedure';
import { DefaultDataTransformer } from '../transformer';
import type { Serialize } from './serialize';

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
