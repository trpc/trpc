import { AnyRootConfig } from './internals/config';
import { ProcedureCallOptions } from './internals/procedureBuilder';
import { ProcedureType } from './types';

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

/**
 * @internal
 * @deprecated
 */
export type AnyProcedureParams = {
  _config: AnyRootConfig;
  _meta: unknown;
  _ctx_out: unknown;
  _input_in: unknown;
  _input_out: unknown;
  _output_in: unknown;
  _output_out: unknown;
};

/**
 * @deprecated
 */
export type ProcedureParams<TParams extends AnyProcedureParams> = TParams;

/**
 * @internal
 */
export type ProcedureArgs<TParams extends AnyProcedure['_def']> =
  void extends TParams['_input_in']
    ? [input?: undefined | void, opts?: ProcedureOptions]
    : undefined extends TParams['_input_in']
    ? [input?: TParams['_input_in'] | void, opts?: ProcedureOptions]
    : [input: TParams['_input_in'], opts?: ProcedureOptions];

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
