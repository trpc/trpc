import { TRPCError } from '../error/TRPCError';
import { getTRPCErrorFromUnknown } from '../error/utils';
import { AnyRootConfig } from './internals/config';
import {
  ProcedureBuilderDef,
  ProcedureCallOptions,
} from './internals/procedureBuilder';
import { UnsetMarker, middlewareMarker } from './internals/utils';
import { MiddlewareResult } from './middleware';
import { ProcedureRouterRecord } from './router';
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
  TConfig extends AnyRootConfig = AnyRootConfig,
  TContextOut = unknown,
  TInputIn = unknown,
  TInputOut = unknown,
  TOutputIn = unknown,
  TOutputOut = unknown,
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
export interface Procedure<
  TType extends ProcedureType,
  TParams extends ProcedureParams,
> {
  _type: TType;
  _def: TParams & ProcedureBuilderDef<TParams>;
  /**
   * @deprecated use `._def.meta` instead
   */
  meta?: TParams['_meta'];
  _procedure: true;
  (input: ProcedureArgs<TParams>[0], ctx: TParams['_ctx_out']): Promise<
    TParams['_output_out']
  >;
}

export type AnyQueryProcedure = Procedure<'query', any>;
export type AnyMutationProcedure = Procedure<'mutation', any>;
export type AnySubscriptionProcedure = Procedure<'subscription', any>;
export type AnyProcedure = Procedure<ProcedureType, any>;

/**
 * @internal
 */
export async function callProcedureInner(
  procedure: AnyProcedure,
  opts: ProcedureCallOptions,
) {
  // run the middlewares recursively with the resolver as the last one
  const callRecursive = async (
    callOpts: { ctx: any; index: number; input?: unknown } = {
      index: 0,
      ctx: opts.ctx,
    },
  ): Promise<MiddlewareResult<any>> => {
    try {
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      const middleware = procedure._def.middlewares[callOpts.index]!;
      const result = await middleware({
        ctx: callOpts.ctx,
        type: opts.type,
        path: opts.path,
        procedure,
        rawInput: opts.rawInput,
        meta: procedure._def.meta,
        input: callOpts.input,
        next: async (nextOpts?: { ctx: any; input?: any }) => {
          return await callRecursive({
            index: callOpts.index + 1,
            ctx:
              nextOpts && 'ctx' in nextOpts
                ? { ...callOpts.ctx, ...nextOpts.ctx }
                : callOpts.ctx,
            input:
              nextOpts && 'input' in nextOpts ? nextOpts.input : callOpts.input,
          });
        },
      });
      return result;
    } catch (cause) {
      return {
        ok: false,
        error: getTRPCErrorFromUnknown(cause),
        marker: middlewareMarker,
      };
    }
  };

  // there's always at least one "next" since we wrap this.resolver in a middleware
  const result = await callRecursive();

  if (!result) {
    throw new TRPCError({
      code: 'INTERNAL_SERVER_ERROR',
      message:
        'No result from middlewares - did you forget to `return next()`?',
    });
  }
  if (!result.ok) {
    // re-throw original error
    throw result.error;
  }
  return result.data;
}

/**
 * @internal
 */
export function callProcedure(
  opts: ProcedureCallOptions & { procedures: ProcedureRouterRecord },
) {
  const { type, path } = opts;
  const procedure = opts.procedures[path];

  if (!procedure || !(type in procedure._def)) {
    throw new TRPCError({
      code: 'NOT_FOUND',
      message: `No "${type}"-procedure on path "${path}"`,
    });
  }

  return callProcedureInner(procedure as AnyProcedure, opts);
}
