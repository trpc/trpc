import { UnsetMarker } from './internals/utils';

type ClientContext = Record<string, unknown>;
export interface ProcedureOptions {
  /**
   * Client-side context
   */
  context?: ClientContext;
}

/**
 * @internal
 */
export interface ProcedureParams<
  TContextIn = unknown,
  TContextOut = unknown,
  TInputIn = unknown,
  TInputOut = unknown,
  TOutputIn = unknown,
  TOutputOut = unknown,
  TMeta = unknown,
> {
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
  _output_in: TOutputIn;
  /**
   * @internal
   */
  _output_out: TOutputOut;
  /**
   * @internal
   */
  _input_in: TInputIn;
  /**
   * @internal
   */
  _input_out: TInputOut;
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
 * @internal
 */
export interface Procedure<TParams extends ProcedureParams> {
  (...args: ProcedureArgs<TParams>): Promise<TParams['_output_out']>;
  /**
   * @deprecated use `._def.meta` instead
   */
  meta?: TParams['_meta'];
}
