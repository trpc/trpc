import { TRPCError } from '../error/TRPCError';
import type { Simplify } from '../types';
import type { AnyRootConfig, RootConfig } from './internals/config';
import type { ParseFn } from './internals/getParseFn';
import type { ProcedureBuilderMiddleware } from './internals/procedureBuilder';
import type {
  ApplyInputOutputsDefaultValue,
  MiddlewareMarker,
  Overwrite,
} from './internals/utils';
import type { ProcedureInputOutput, ProcedureParams } from './procedure';
import type { ProcedureType } from './types';

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
  | MiddlewareErrorResult<TParams>
  | MiddlewareOKResult<TParams>;

/**
 * @internal
 */
export interface MiddlewareBuilder<
  TRoot extends ProcedureParams,
  TNewParams extends ProcedureParams,
> {
  /**
   * Create a new builder based on the current middleware builder
   */
  unstable_pipe<$Params extends ProcedureParams>(
    fn: {
      _config: TRoot['_config'];
      _meta: TRoot['_meta'];
      _ctx_out: Overwrite<TRoot['_ctx_out'], TNewParams['_ctx_out']>;
      _inputOutputs: ApplyInputOutputsDefaultValue<TRoot['_inputOutputs'], TNewParams['_inputOutputs']>;
    } extends infer OParams extends ProcedureParams
      ?
          | MiddlewareBuilder<OParams, $Params>
          | MiddlewareFunction<OParams, $Params>
      : never,
  ): CreateMiddlewareReturnInput<
    TRoot,
    TNewParams,
    Overwrite<TNewParams, $Params>
  >;

  /**
   * List of middlewares within this middleware builder
   */
  _middlewares: MiddlewareFunction<TRoot, TNewParams>[];
}

/**
 * @internal
 * FIXME: there must be a nicer way of doing this, it's hard to maintain when we have several structures like this
 */
type CreateMiddlewareReturnInput<
  TRoot extends ProcedureParams,
  TPrev extends ProcedureParams,
  TNext extends ProcedureParams,
> = MiddlewareBuilder<
  TRoot,
  {
    _config: TPrev['_config'];
    _meta: TPrev['_meta'];
    _ctx_out: Overwrite<TPrev['_ctx_out'], TNext['_ctx_out']>;
    _inputOutputs: ApplyInputOutputsDefaultValue<TPrev['_inputOutputs'], TNext['_inputOutputs']>;
  }
>;

/**
 * @internal
 */
type deriveParamsFromConfig<
  TConfig extends AnyRootConfig,
  TInputOutputs extends readonly ProcedureInputOutput[] = readonly ProcedureInputOutput[],
> = {
  _config: TConfig;
  // eslint-disable-next-line @typescript-eslint/ban-types
  _ctx_out: {};
  _inputOutputs: TInputOutputs;
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
    ctx: Simplify<
      Overwrite<TParams['_config']['$types']['ctx'], TParams['_ctx_out']>
    >;
    type: ProcedureType;
    path: string;
    input: TParams['_inputOutputs'][number]['inputIn'];
    rawInput: unknown;
    meta: TParams['_meta'] | undefined;
    next: {
      (): Promise<MiddlewareResult<TParams>>;
      <$Context>(opts: { ctx: $Context }): Promise<
        MiddlewareResult<{
          _config: TParams['_config'];
          _ctx_out: $Context;
          _inputOutputs: TParams['_inputOutputs'];
          _meta: TParams['_meta'];
        }>
      >;
      (opts: { rawInput: unknown }): Promise<MiddlewareResult<TParams>>;
    };
  }): Promise<MiddlewareResult<TParamsAfter>>;
  _type?: string | undefined;
};

/**
 * @internal
 */
export function createMiddlewareFactory<
  TConfig extends AnyRootConfig,
  TInputOutputs extends readonly ProcedureInputOutput[] = readonly ProcedureInputOutput[],
>() {
  function createMiddlewareInner<TNewParams extends ProcedureParams>(
    middlewares: MiddlewareFunction<any, any>[],
  ): MiddlewareBuilder<deriveParamsFromConfig<TConfig, TInputOutputs>, TNewParams> {
    return {
      _middlewares: middlewares,
      unstable_pipe(middlewareBuilderOrFn) {
        const pipedMiddleware =
          '_middlewares' in middlewareBuilderOrFn
            ? middlewareBuilderOrFn._middlewares
            : [middlewareBuilderOrFn];

        return createMiddlewareInner([
          ...(middlewares as any),
          ...pipedMiddleware,
        ]);
      },
    };
  }

  function createMiddleware<TNewParams extends ProcedureParams>(
    fn: MiddlewareFunction<
      deriveParamsFromConfig<TConfig, TInputOutputs>,
      TNewParams
    >,
  ): MiddlewareBuilder<deriveParamsFromConfig<TConfig, TInputOutputs>, TNewParams> {
    return createMiddlewareInner([fn]);
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
    TCtx extends { input: infer T extends readonly ProcedureInputOutput[] } ? T : ProcedureInputOutput[]
  >(),
});

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
        cause,
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
        cause,
      });
    }
  };
  outputMiddleware._type = 'output';
  return outputMiddleware;
}
