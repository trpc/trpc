import type { Jsonify } from 'type-fest';
import { AnyProcedure } from '../core';
import { DefaultDataTransformer } from '../transformer';

/**
 * @internal
 */
export type inferTransformedProcedureOutput<TProcedure extends AnyProcedure> =
  TProcedure['_def']['_config']['transformer'] extends DefaultDataTransformer
    ? Jsonify<TProcedure['_def']['_output_out']>
    : TProcedure['_def']['_output_out'];
