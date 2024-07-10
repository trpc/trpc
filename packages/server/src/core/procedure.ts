import type { AnyRootConfig } from './internals/config';
import {
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
  TParams['_inputOutputs'][number]['inputIn'] extends infer TInputDefs ?
    TInputDefs extends infer TInputDef ?
      TInputDef extends UnsetMarker ?
        [input?: undefined | void, opts?: ProcedureOptions] :
      undefined extends TInputDef ?
        [input?: TInputDef | void, opts?: ProcedureOptions] :
      [input: TInputDef, opts?: ProcedureOptions] :
    never:
  never
;

//    v?
type TestProcArgsEmpty = ProcedureArgs<{
  _config: AnyRootConfig,
  _ctx_out: unknown,
  _meta: unknown,
  _inputOutputs: [{
    inputIn: { type: 'a' };
    inputOut: { type: 'a' };
    outputIn: { type: 'a' }[];
    outputOut: { type: 'a' }[];
  },
    {
      inputIn: { type: 'b' };
      inputOut: { type: 'b' };
      outputIn: { type: 'b' }[];
      outputOut: { type: 'b' }[];
    }
  ]
}>

//    v?
type TestProcArgsSingle = ProcedureArgs<{
  _config: AnyRootConfig,
  _ctx_out: unknown,
  _meta: unknown,
  _inputOutputs: [{
    inputIn: 'inputIn';
    inputOut: 'inputOut';
    outputIn: 'outputIn';
    outputOut: 'outputOut';
  }]
}>

//    v?
type TestProcArgsMulti = ProcedureArgs<{
  _config: AnyRootConfig,
  _ctx_out: unknown,
  _meta: unknown,
  _inputOutputs: [{
    inputIn: 'inputIn1';
    inputOut: 'inputOut1';
    outputIn: 'outputIn1';
    outputOut: 'outputOut1';
  },
    {
      inputIn: 'inputIn2';
      inputOut: 'inputOut2';
      outputIn: 'outputIn2';
      outputOut: 'outputOut2';
    }
    ]
}>

/**
 *
 * @internal
 */
export interface Procedure<
  TType extends ProcedureType,
  TParams extends ProcedureParams<AnyRootConfig, unknown, TInputOutputs, unknown>,
  TInputOutputs extends readonly ProcedureInputOutput[] = readonly ProcedureInputOutput[]
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
