import type { Jsonify } from 'type-fest';
import { AnyProcedure, AnyRouter } from '../core';
import { DefaultDataTransformer } from '../transformer';

/**
 * @internal
 */
export type TransformedData<
  TRouter extends AnyRouter,
  TData,
> = TRouter['_def']['_config']['transformer'] extends DefaultDataTransformer
  ? Jsonify<TData>
  : TData;

/**
 * @internal
 */
export type TransformedProcedureOutput<TProcedure extends AnyProcedure> =
  TProcedure['_def']['_config']['transformer'] extends DefaultDataTransformer
    ? Jsonify<TProcedure['_def']['_output_out']>
    : TProcedure['_def']['_output_out'];
