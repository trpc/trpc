import { AnyRootConfig } from './internals/config';
import {
  ProcedureBuilderDef,
  ProcedureCallOptions,
} from './internals/procedureBuilder';
import { DefaultValue, UnsetMarker } from './internals/utils';
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
 * @internal
 */
export type ProcedureParams<TParams extends AnyProcedureParams> = TParams;

/**
 * @internal
 */
export type ProcedureArgs<TParams extends ProcedureParams<AnyProcedureParams>> =
  TParams['_input_in'] extends UnsetMarker
    ? [input?: undefined | void, opts?: ProcedureOptions]
    : undefined extends TParams['_input_in']
    ? [input?: TParams['_input_in'] | void, opts?: ProcedureOptions]
    : [input: TParams['_input_in'], opts?: ProcedureOptions];

/**
 *
 * @internal
 */
export interface Procedure<TType extends ProcedureType, TInput, TOutput> {
  _type: TType;
  _def: {
    _input_in: TInput;
    _output_out: TOutput;
  };
  _procedure: true;
  /**
   * @internal
   */
  (opts: ProcedureCallOptions): Promise<unknown>;
}

export interface QueryProcedure<TInput, TOutput>
  extends Procedure<'query', TInput, TOutput> {}

export interface MutationProcedure<TInput, TOutput>
  extends Procedure<'mutation', TInput, TOutput> {}

export interface SubscriptionProcedure<TInput, TOutput>
  extends Procedure<'subscription', TInput, TOutput> {}

export type AnyQueryProcedure = QueryProcedure<any, any>;
export type AnyMutationProcedure = MutationProcedure<any, any>;
export type AnySubscriptionProcedure = SubscriptionProcedure<any, any>;
export type AnyProcedure = Procedure<ProcedureType, any, any>;
