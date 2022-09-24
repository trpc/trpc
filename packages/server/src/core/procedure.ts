import { DefaultErrorShape } from '../error/formatter';
import { CombinedDataTransformer } from '../transformer';
import { RootConfig } from './internals/config';
import {
  ProcedureBuilder,
  ProcedureCallOptions,
} from './internals/procedureBuilder';
import { UnsetMarker } from './internals/utils';
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
 * FIXME: this should only take 1 generic argument instead of a list
 * @internal
 */
export interface ProcedureParams<
  TConfig extends RootConfig = {
    transformer: CombinedDataTransformer;
    errorShape: DefaultErrorShape;
    ctx: Record<string, unknown>;
    meta: Record<string, unknown>;
  },
  TContextIn = unknown,
  TContextOut = unknown,
  TInputIn = unknown,
  TInputOut = unknown,
  TOutputIn = unknown,
  TOutputOut = unknown,
  TMeta = unknown,
> {
  // FIXME make non-optional
  _config: TConfig;
  /**
   * @internal
   */
  _meta: TMeta;
  /**
   * @internal
   */
  _ctx_in: TContextIn;
  /**
   * @internal
   */
  _ctx_out: TContextOut;
  /**
   * @internal
   */
  _input_in: TInputIn;
  /**
   * @internal
   */
  _input_out: TInputOut;
  /**
   * @internal
   */
  _output_in: TOutputIn;
  /**
   * @internal
   */
  _output_out: TOutputOut;
}

/**
 * @internal
 */
export type ProcedureArgs<TParams extends ProcedureParams> =
  TParams['_input_in'] extends UnsetMarker
    ? [input?: undefined | void, opts?: ProcedureOptions]
    : undefined extends TParams['_input_in']
    ? [input?: TParams['_input_in'] | void, opts?: ProcedureOptions]
    : [input: TParams['_input_in'], opts?: ProcedureOptions];

/**
 *
 * @internal
 */
export interface ProcedureBase<
  TType extends ProcedureType,
  TParams extends ProcedureParams,
> {
  _type: TType;
  _def: TParams & ProcedureBuilder<TParams>['_def'];
  /**
   * @deprecated use `._def.meta` instead
   */
  meta?: TParams['_meta'];
  _procedure: true;
  /**
   * @internal
   */
  (opts: ProcedureCallOptions): Promise<unknown>;
}

export interface QueryProcedure<TParams extends ProcedureParams>
  extends ProcedureBase<'query', TParams> {}
export type AnyQueryProcedure = QueryProcedure<any>;

export interface MutationProcedure<TParams extends ProcedureParams>
  extends ProcedureBase<'mutation', TParams> {}
export type AnyMutationProcedure = MutationProcedure<any>;

export interface SubscriptionProcedure<TParams extends ProcedureParams>
  extends ProcedureBase<'subscription', TParams> {}
export type AnySubscriptionProcedure = SubscriptionProcedure<any>;

export interface Procedure<TParams extends ProcedureParams>
  extends ProcedureBase<ProcedureType, TParams> {}
export type AnyProcedure = Procedure<any>;
