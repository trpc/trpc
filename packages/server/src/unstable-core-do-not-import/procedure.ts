import type { inferObservableValue } from '../observable';
import type { ProcedureCallOptions } from './procedureBuilder';
import type { Serialize } from './serialize';
import type { inferRootTypes, TRPCInferrable } from './TRPCInferrable';

export const procedureTypes = ['query', 'mutation', 'subscription'] as const;
/**
 * @public
 */
export type ProcedureType = (typeof procedureTypes)[number];

type ClientContext = Record<string, unknown>;

/**
 * @internal
 */
export interface ProcedureOptions {
  /**
   * Client-side context
   */
  context?: ClientContext;
  signal?: AbortSignal;
}

interface BuiltProcedureDef {
  input: unknown;
  output: unknown;
}
/**
 *
 * @internal
 */
export interface Procedure<
  TType extends ProcedureType,
  TDef extends BuiltProcedureDef,
> {
  _def: {
    _input_in: TDef['input'];
    _output_out: TDef['output'];
    procedure: true;
    type: TType;
    /**
     * @internal
     * Meta is not inferrable on individual procedures, only on the router
     */
    meta: unknown;
  };
  /**
   * @internal
   */
  (opts: ProcedureCallOptions): Promise<unknown>;
}

export interface QueryProcedure<TDef extends BuiltProcedureDef>
  extends Procedure<'query', TDef> {}

export interface MutationProcedure<TDef extends BuiltProcedureDef>
  extends Procedure<'mutation', TDef> {}

export interface SubscriptionProcedure<TDef extends BuiltProcedureDef>
  extends Procedure<'subscription', TDef> {}

export type AnyQueryProcedure = QueryProcedure<any>;
export type AnyMutationProcedure = MutationProcedure<any>;
export type AnySubscriptionProcedure = SubscriptionProcedure<any>;
export type AnyProcedure = Procedure<ProcedureType, any>;

/**
 * @internal
 */
export type inferTransformedProcedureOutput<
  TInferrable extends TRPCInferrable,
  TProcedure extends AnyProcedure,
> = inferRootTypes<TInferrable>['transformer'] extends false
  ? Serialize<TProcedure['_def']['_output_out']>
  : TProcedure['_def']['_output_out'];

/** @internal */
export type inferTransformedSubscriptionOutput<
  TInferrable extends TRPCInferrable,
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
