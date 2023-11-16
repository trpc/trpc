import { getTRPCErrorFromUnknown, TRPCError } from '../error/TRPCError';
import { Simplify } from '../types';
import { AnyProcedureBuilderParams } from './internals/builderTypes';
import { AnyRootConfig, RootConfig } from './internals/config';
import { getParseFn, ParseFn } from './internals/getParseFn';
import { ProcedureBuilderMiddleware } from './internals/procedureBuilder';
import {
  DefaultValue as FallbackValue,
  GetRawInputFn,
  MiddlewareMarker,
  middlewareMarker,
  Overwrite,
} from './internals/utils';
import { inferParser, Parser } from './parser';
import { ProcedureType } from './types';

/**
 * @internal
 */
interface MiddlewareResultBase {
  /**
   * All middlewares should pass through their `next()`'s output.
   * Requiring this marker makes sure that can't be forgotten at compile-time.
   */
  readonly marker: MiddlewareMarker;
}

/**
 * @internal
 */
interface MiddlewareOKResult<_TParams extends AnyProcedureBuilderParams>
  extends MiddlewareResultBase {
  ok: true;
  data: unknown;
  // this could be extended with `input`/`rawInput` later
}

/**
 * @internal
 */
interface MiddlewareErrorResult<_TParams extends AnyProcedureBuilderParams>
  extends MiddlewareResultBase {
  ok: false;
  error: TRPCError;
}

/**
 * @internal
 */
export type MiddlewareResult<TParams extends AnyProcedureBuilderParams> =
  | MiddlewareErrorResult<TParams>
  | MiddlewareOKResult<TParams>;

/**
 * @internal
 */
type deriveParamsFromConfig<
  TConfig extends AnyRootConfig,
  TInputIn = unknown,
> = {
  _config: TConfig;
  // eslint-disable-next-line @typescript-eslint/ban-types
  _ctx_out: {};
  _input_out: TInputIn;
  _input_in: TInputIn;
  _output_in: unknown;
  _output_out: unknown;
  _meta: TConfig['$types']['meta'];
};
/**
 * @internal
 */
export type MiddlewareFunction<
  TParams extends AnyProcedureBuilderParams,
  TParamsAfter extends AnyProcedureBuilderParams,
> = {
  (opts: {
    ctx: Simplify<
      Overwrite<TParams['_config']['$types']['ctx'], TParams['_ctx_out']>
    >;
    type: ProcedureType;
    path: string;
    input: TParams['_input_out'];
    getRawInput: GetRawInputFn;
    meta: TParams['_meta'] | undefined;
    next: {
      (): Promise<MiddlewareResult<TParams>>;
      <$Context>(opts: { ctx?: $Context; input?: unknown }): Promise<
        MiddlewareResult<{
          _config: TParams['_config'];
          _ctx_out: $Context;
          _input_in: TParams['_input_in'];
          _input_out: TParams['_input_out'];
          _output_in: TParams['_output_in'];
          _output_out: TParams['_output_out'];
          _meta: TParams['_meta'];
        }>
      >;
      (opts: { getRawInput: GetRawInputFn }): Promise<
        MiddlewareResult<TParams>
      >;
    };
  }): Promise<MiddlewareResult<TParamsAfter>>;
  _type?: string | undefined;
};

type OverwriteOuts<
  TFirst extends AnyProcedureBuilderParams,
  TSecond extends AnyProcedureBuilderParams,
> = Overwrite<
  TFirst['_config']['$types']['ctx'],
  TFirst['_ctx_out']
> extends TSecond['_config']['$types']['ctx']
  ? TFirst['_input_out'] extends TSecond['_input_in']
    ? {
        _config: TFirst['_config'];
        _ctx_out: Overwrite<
          Overwrite<TFirst['_config']['$types']['ctx'], TFirst['_ctx_out']>,
          TSecond['_ctx_out']
        >;
        _input_in: TFirst['_input_in'];
        _input_out: unknown extends TSecond['_input_out']
          ? TFirst['_input_out']
          : Overwrite<TFirst['_input_out'], TSecond['_input_out']>;
        _output_in: TSecond['_output_in'];
        _output_out: TSecond['_output_out'];
        _meta: TFirst['_meta'];
      }
    : {
        error: 'The composed middlewares have incompatible inputs';
        prevMiddlewareInputOut: TFirst['_input_out'];
        nextMiddlewareInputIn: TSecond['_input_in'];
      }
  : {
      error: 'The composed middlewares have incompatible contexts';
      prevMiddlewareContextOut: Overwrite<
        TFirst['_config']['$types']['ctx'],
        TFirst['_ctx_out']
      >;
      nextMiddlewareContextIn: TSecond['_config']['$types']['ctx'];
    };

type MergeOutputs<
  T extends [AnyProcedureBuilderParams, ...AnyProcedureBuilderParams[]],
> = T extends [
  infer First extends AnyProcedureBuilderParams,
  infer Second extends AnyProcedureBuilderParams,
  ...infer Rest extends any[],
]
  ? OverwriteOuts<First, Second> extends infer P
    ? P extends AnyProcedureBuilderParams
      ? MergeOutputs<[P, ...Rest]>
      : P
    : never
  : T extends [infer First extends AnyProcedureBuilderParams]
  ? First
  : 'The composed middlewares are incompatible';

export function composeMiddlewares<
  TFirstIn extends AnyProcedureBuilderParams,
  TFirstOut extends AnyProcedureBuilderParams,
  TSecondIn extends AnyProcedureBuilderParams,
  TSecondOut extends AnyProcedureBuilderParams,
>(
  mw1: MiddlewareFunction<TFirstIn, TFirstOut>,
  mw2: MiddlewareFunction<TSecondIn, TSecondOut>,
): MergeOutputs<[TFirstOut, TSecondOut]> extends infer Out
  ? Out extends AnyProcedureBuilderParams
    ? MiddlewareFunction<TFirstIn, Out>
    : Out
  : 'The composed middlewares are incompatible';
export function composeMiddlewares<
  TFirstIn extends AnyProcedureBuilderParams,
  TFirstOut extends AnyProcedureBuilderParams,
  TSecondIn extends AnyProcedureBuilderParams,
  TSecondOut extends AnyProcedureBuilderParams,
  TThirdIn extends AnyProcedureBuilderParams,
  TThirdOut extends AnyProcedureBuilderParams,
>(
  mw1: MiddlewareFunction<TFirstIn, TFirstOut>,
  mw2: MiddlewareFunction<TSecondIn, TSecondOut>,
  mw3: MiddlewareFunction<TThirdIn, TThirdOut>,
): MergeOutputs<[TFirstOut, TSecondOut, TThirdOut]> extends infer Out
  ? Out extends AnyProcedureBuilderParams
    ? MiddlewareFunction<TFirstIn, Out>
    : Out
  : 'The composed middlewares are incompatible';
export function composeMiddlewares<
  TFirstIn extends AnyProcedureBuilderParams,
  TFirstOut extends AnyProcedureBuilderParams,
  TSecondIn extends AnyProcedureBuilderParams,
  TSecondOut extends AnyProcedureBuilderParams,
  TThirdIn extends AnyProcedureBuilderParams,
  TThirdOut extends AnyProcedureBuilderParams,
  TFourthIn extends AnyProcedureBuilderParams,
  TFourthOut extends AnyProcedureBuilderParams,
>(
  mw1: MiddlewareFunction<TFirstIn, TFirstOut>,
  mw2: MiddlewareFunction<TSecondIn, TSecondOut>,
  mw3: MiddlewareFunction<TThirdIn, TThirdOut>,
  mw4: MiddlewareFunction<TFourthIn, TFourthOut>,
): MergeOutputs<
  [TFirstOut, TSecondOut, TThirdOut, TFourthOut]
> extends infer Out
  ? Out extends AnyProcedureBuilderParams
    ? MiddlewareFunction<TFirstIn, Out>
    : Out
  : 'The composed middlewares are incompatible';
export function composeMiddlewares<
  TFirstIn extends AnyProcedureBuilderParams,
  TFirstOut extends AnyProcedureBuilderParams,
  TSecondIn extends AnyProcedureBuilderParams,
  TSecondOut extends AnyProcedureBuilderParams,
  TThirdIn extends AnyProcedureBuilderParams,
  TThirdOut extends AnyProcedureBuilderParams,
  TFourthIn extends AnyProcedureBuilderParams,
  TFourthOut extends AnyProcedureBuilderParams,
  TFifthIn extends AnyProcedureBuilderParams,
  TFifthOut extends AnyProcedureBuilderParams,
>(
  mw1: MiddlewareFunction<TFirstIn, TFirstOut>,
  mw2: MiddlewareFunction<TSecondIn, TSecondOut>,
  mw3: MiddlewareFunction<TThirdIn, TThirdOut>,
  mw4: MiddlewareFunction<TFourthIn, TFourthOut>,
  mw5: MiddlewareFunction<TFifthIn, TFifthOut>,
): MergeOutputs<
  [TFirstOut, TSecondOut, TThirdOut, TFourthOut, TFifthOut]
> extends infer Out
  ? Out extends AnyProcedureBuilderParams
    ? MiddlewareFunction<TFirstIn, Out>
    : Out
  : 'The composed middlewares are incompatible';
export function composeMiddlewares(
  ...middlewares: MiddlewareFunction<any, any>[]
): MiddlewareFunction<any, any> {
  return async (opts) => {
    // run the middlewares recursively with the resolver as the last one
    const callRecursive = async (
      callOpts: {
        ctx: any;
        index: number;
        input?: unknown;
        getRawInput?: GetRawInputFn;
      } = {
        index: 0,
        ctx: opts.ctx,
      },
    ): Promise<MiddlewareResult<any>> => {
      try {
        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        const middleware = middlewares[callOpts.index]!;
        const result = await middleware({
          ctx: callOpts.ctx,
          type: opts.type,
          path: opts.path,
          getRawInput: callOpts.getRawInput ?? opts.getRawInput,
          meta: opts.meta,
          input: callOpts.input,
          next(_nextOpts?: any) {
            const nextOpts = _nextOpts as
              | {
                  ctx?: Record<string, unknown>;
                  input?: unknown;
                  getRawInput?: GetRawInputFn;
                }
              | undefined;

            return callRecursive({
              index: callOpts.index + 1,
              ctx:
                nextOpts && 'ctx' in nextOpts
                  ? { ...callOpts.ctx, ...nextOpts.ctx }
                  : callOpts.ctx,
              input:
                nextOpts && 'input' in nextOpts
                  ? nextOpts.input
                  : callOpts.input,
              getRawInput:
                nextOpts && 'getRawInput' in nextOpts
                  ? nextOpts.getRawInput
                  : callOpts.getRawInput,
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

    return await callRecursive();
  };
}

/**
 * @internal
 */
export function createMiddlewareFactory<
  TConfig extends AnyRootConfig,
  TInputIn = unknown,
>() {
  function createMiddleware<TNewParams extends AnyProcedureBuilderParams>(
    fn: MiddlewareFunction<
      deriveParamsFromConfig<TConfig, TInputIn>,
      TNewParams
    >,
  ): MiddlewareFunction<deriveParamsFromConfig<TConfig, TInputIn>, TNewParams> {
    return fn;
  }

  return createMiddleware;
}

export const experimental_standaloneMiddleware = <
  TCtx extends {
    ctx?: object;
    meta?: object;
    input?: unknown;
  },
>() => ({
  create: createMiddlewareFactory<
    RootConfig<{
      ctx: TCtx extends { ctx: infer T extends object } ? T : object;
      meta: TCtx extends { meta: infer T extends object } ? T : object;
      errorShape: object;
      transformer: object;
    }>,
    TCtx extends { input: infer T } ? T : unknown
  >(),
});

function isPlainObject(obj: unknown) {
  return obj && typeof obj === 'object' && !Array.isArray(obj);
}

export function experimental_standaloneInputMiddleware<$Parser extends Parser>(
  schema: $Parser,
): MiddlewareFunction<
  deriveParamsFromConfig<AnyRootConfig>,
  {
    _config: AnyRootConfig;
    _meta: unknown;
    _ctx_out: {};
    _input_in: unknown;
    _input_out: inferParser<$Parser>['out'];
    _output_in: unknown;
    _output_out: unknown;
  }
> {
  return createInputMiddleware(getParseFn(schema));
}

/**
 * @internal
 * Please note, `trpc-openapi` uses this function.
 */
export function createInputMiddleware<TInput>(parse: ParseFn<TInput>) {
  const inputMiddleware: ProcedureBuilderMiddleware = async (opts) => {
    let parsedInput: ReturnType<typeof parse>;

    const rawInput = await opts.getRawInput();
    try {
      parsedInput = await parse(rawInput);
    } catch (cause) {
      throw new TRPCError({
        code: 'BAD_REQUEST',
        cause,
      });
    }

    // Multiple input parsers
    const combinedInput =
      isPlainObject(opts.input) && isPlainObject(parsedInput)
        ? {
            ...opts.input,
            ...parsedInput,
          }
        : parsedInput;

    return opts.next({ input: combinedInput });
  };
  inputMiddleware._type = 'input';
  return inputMiddleware;
}

/**
 * @internal
 */
export function createOutputMiddleware<TOutput>(parse: ParseFn<TOutput>) {
  const outputMiddleware: ProcedureBuilderMiddleware = async ({ next }) => {
    const result = await next();
    if (!result.ok) {
      // pass through failures without validating
      return result;
    }
    try {
      const data = await parse(result.data);
      return {
        ...result,
        data,
      };
    } catch (cause) {
      throw new TRPCError({
        message: 'Output validation failed',
        code: 'INTERNAL_SERVER_ERROR',
        cause,
      });
    }
  };
  outputMiddleware._type = 'output';
  return outputMiddleware;
}
