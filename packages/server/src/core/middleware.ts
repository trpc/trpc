import { TRPCError } from '../error/TRPCError';
import { getCauseFromUnknown } from '../error/utils';
import { AnyRootConfig } from './internals/config';
import { ParseFn } from './internals/getParseFn';
import { ProcedureBuilderMiddleware } from './internals/procedureBuilder';
import {
  DefaultValue as FallbackValue,
  MiddlewareMarker,
  Overwrite,
} from './internals/utils';
import { ProcedureParams } from './procedure';
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
interface MiddlewareOKResult<_TParams extends ProcedureParams>
  extends MiddlewareResultBase {
  ok: true;
  data: unknown;
  // this could be extended with `input`/`rawInput` later
}

/**
 * @internal
 */
interface MiddlewareErrorResult<_TParams extends ProcedureParams>
  extends MiddlewareResultBase {
  ok: false;
  error: TRPCError;
}

/**
 * @internal
 */
export type MiddlewareResult<TParams extends ProcedureParams> =
  | MiddlewareOKResult<TParams>
  | MiddlewareErrorResult<TParams>;

type AnyMiddlewareBuilder = MiddlewareBuilder<any, any>;
export interface MiddlewareBuilder<
  TParams extends ProcedureParams,
  TNewParams extends ProcedureParams,
> {
  pipe<$Params extends ProcedureParams>(
    fn: MiddlewareFunction<TParams, $Params>,
  ): CreateMiddlewareReturnInput<TParams, $Params>;

  _self: MiddlewareFunction<TParams, TNewParams>;
}

type CreateMiddlewareReturnInput<
  TPrev extends ProcedureParams,
  TNext extends ProcedureParams,
> = MiddlewareBuilder<
  {
    _config: TPrev['_config'];
    _meta: TPrev['_meta'];
    _ctx_out: Overwrite<TPrev['_ctx_out'], TNext['_ctx_out']>;
    _input_in: FallbackValue<TNext['_input_in'], TPrev['_input_in']>;
    _input_out: FallbackValue<TNext['_input_out'], TPrev['_input_out']>;
    _output_in: FallbackValue<TNext['_output_in'], TPrev['_output_in']>;
    _output_out: FallbackValue<TNext['_output_out'], TPrev['_output_out']>;
  },
  TNext
>;

type deriveParamsFromConfig<TConfig extends AnyRootConfig> = {
  _config: TConfig;
  _ctx_out: TConfig['$types']['ctx'];
  _input_out: unknown;
  _input_in: unknown;
  _output_in: unknown;
  _output_out: unknown;
  _meta: TConfig['$types']['meta'];
};
/**
 * @internal
 */
export type MiddlewareFunction<
  TParams extends ProcedureParams,
  TParamsAfter extends ProcedureParams,
> = {
  (opts: {
    ctx: TParams['_ctx_out'];
    type: ProcedureType;
    path: string;
    input: TParams['_input_out'];
    rawInput: unknown;
    meta: TParams['_meta'] | undefined;
    next: {
      (): Promise<MiddlewareResult<TParams>>;
      <$Context>(opts: { ctx: $Context }): Promise<
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
    };
  }): Promise<MiddlewareResult<TParamsAfter>>;
  _type?: string | undefined;
};

/**
 * @internal
 */
// FIXME this should use RootConfig
// export function createMiddlewareFactory<TConfig extends AnyRootConfig>() {
//   return function createMiddleware<TNewParams extends ProcedureParams>(
//     fn: MiddlewareFunction<deriveParamsFromConfig<TConfig>, TNewParams>,
//   ) {
//     return fn;
//   };
// }

export function createMiddlewareFactory<TConfig extends AnyRootConfig>() {
  function createMiddleware<TNewParams extends ProcedureParams>(
    fn: MiddlewareFunction<deriveParamsFromConfig<TConfig>, TNewParams>,
  ): MiddlewareBuilder<deriveParamsFromConfig<TConfig>, TNewParams> {
    return {
      _self: fn,
      // if we're going to pipe _n_ middlewares together
      // we probably need to merge them in like in procedurebuilder
      // we're also probably not preserving prev state
      // its late...
      pipe(middleware) {
        return middleware as unknown as AnyMiddlewareBuilder;
      },
    };
  }

  return createMiddleware;
}

function isPlainObject(obj: unknown) {
  return obj && typeof obj === 'object' && !Array.isArray(obj);
}

/**
 * @internal
 * Please note, `trpc-openapi` uses this function.
 */
export function createInputMiddleware<TInput>(parse: ParseFn<TInput>) {
  const inputMiddleware: ProcedureBuilderMiddleware = async ({
    next,
    rawInput,
    input,
  }) => {
    let parsedInput: ReturnType<typeof parse>;
    try {
      parsedInput = await parse(rawInput);
    } catch (cause) {
      throw new TRPCError({
        code: 'BAD_REQUEST',
        cause: getCauseFromUnknown(cause),
      });
    }

    // Multiple input parsers
    const combinedInput =
      isPlainObject(input) && isPlainObject(parsedInput)
        ? {
            ...input,
            ...parsedInput,
          }
        : parsedInput;

    // TODO fix this typing?
    return next({ input: combinedInput } as any);
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
        cause: getCauseFromUnknown(cause),
      });
    }
  };
  outputMiddleware._type = 'output';
  return outputMiddleware;
}
