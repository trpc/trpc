/* eslint-disable @typescript-eslint/ban-types */
import { DefaultErrorShape } from '../error/formatter';
import { CombinedDataTransformer } from '../transformer';
import { RootConfig } from './internals/config';
import { ProcedureBuilderDef } from './internals/procedureBuilder';
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
  TConfig extends RootConfig = {
    transformer: CombinedDataTransformer;
    errorShape: DefaultErrorShape;
    ctx: Record<string, unknown>;
    meta: Record<string, unknown> | UnsetMarker;
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

type AddParamToObject<
  TObject,
  TProperty extends string,
  TParam,
> = TParam extends UnsetMarker
  ? TObject & { [p in TProperty]?: undefined | void }
  : undefined extends TParam
  ? TObject & { [p in TProperty]?: TParam | void }
  : TObject & { [p in TProperty]: TParam };

// type UndefinedIfUnsetMarker<TParam> = TParam extends UnsetMarker
//   ? undefined
//   : TParam;

/**
 *
 * @internal
 */
export interface ProcedureBase<TParams extends ProcedureParams> {
  _def: TParams & ProcedureBuilderDef;
  /**
   * @deprecated use `._def.meta` instead
   */
  meta?: TParams['_meta'];
  _procedure: true;
  (
    inputAndCtx: AddParamToObject<
      AddParamToObject<{}, 'input', TParams['_input_in']>,
      'ctx',
      TParams['_config']['ctx']
    >,
    opts?: ProcedureOptions,
  ): Promise<TParams['_output_out']>;
}

export interface QueryProcedure<TParams extends ProcedureParams>
  extends ProcedureBase<TParams> {
  _query: true;
}

export interface MutationProcedure<TParams extends ProcedureParams>
  extends ProcedureBase<TParams> {
  _mutation: true;
}

export interface SubscriptionProcedure<TParams extends ProcedureParams>
  extends ProcedureBase<TParams> {
  _subscription: true;
}

export type Procedure<TParams extends ProcedureParams> =
  | QueryProcedure<TParams>
  | MutationProcedure<TParams>
  | SubscriptionProcedure<TParams>;

export type AnyProcedure = Procedure<any>;
