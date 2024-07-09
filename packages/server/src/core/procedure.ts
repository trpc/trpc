import type { AnyRootConfig } from './internals/config';
import type {
  ProcedureBuilderDef,
  ProcedureCallOptions,
} from './internals/procedureBuilder';
import type { UnsetMarker } from './internals/utils';
import type { ProcedureType } from './types';

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
 * Describe the shape of an input/output tuple: [[TInputIn, TInputOut], T[OutputIn, TOutputOut]]
 * @internal
 */
export type ProcedureInputOutput<TInputIn = unknown, TInputOut = unknown, TOutputIn = unknown, TOutputOut = unknown> = {
  inputIn: TInputIn;
  inputOut: TInputOut;
  outputIn: TOutputIn;
  outputOut: TOutputOut;
};

/**
 * FIXME: this should only take 1 generic argument instead of a list
 * @internal
 */
export interface ProcedureParams<
  TConfig extends AnyRootConfig = AnyRootConfig,
  TContextOut = unknown,
  TInputOutputs extends readonly ProcedureInputOutput[] = readonly ProcedureInputOutput[],
  TMeta = unknown,
> {
  _config: TConfig;
  /**
   * @internal
   */
  _meta: TMeta;
  /**
   * @internal
   */
  _ctx_out: TContextOut;

  /**
   * @internal
   */
  _inputOutputs: TInputOutputs;
}

/**
 * @internal
 */
export type ProcedureArgs<TParams extends ProcedureParams> =
  TParams['_inputOutputs'] extends UnsetMarker
    ? [input?: undefined | void, opts?: ProcedureOptions]
    : undefined extends TParams['_inputOutputs'][number]['inputIn']
    ? [input?: TParams['_inputOutputs'][number]['inputIn'] | void, opts?: ProcedureOptions]
    : [input: TParams['_inputOutputs'][number]['inputIn'], opts?: ProcedureOptions];

/**
 *
 * @internal
 */
export interface Procedure<
  TType extends ProcedureType,
  TParams extends ProcedureParams,
> {
  _type: TType;
  _def: ProcedureBuilderDef<TParams> & TParams;
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

export type AnyQueryProcedure = Procedure<'query', any>;
export type AnyMutationProcedure = Procedure<'mutation', any>;
export type AnySubscriptionProcedure = Procedure<'subscription', any>;
export type AnyProcedure = Procedure<ProcedureType, any>;
