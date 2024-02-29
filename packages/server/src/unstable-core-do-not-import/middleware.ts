import { TRPCError } from './error/TRPCError';
import type { ParseFn } from './parser';
import type { ProcedureType } from './procedure';
import type { GetRawInputFn, Overwrite, Simplify } from './types';
import { isObject } from './utils';

/** @internal */
export const middlewareMarker = 'middlewareMarker' as 'middlewareMarker' & {
  __brand: 'middlewareMarker';
};
type MiddlewareMarker = typeof middlewareMarker;

interface MiddlewareResultBase {
  /**
   * All middlewares should pass through their `next()`'s output.
   * Requiring this marker makes sure that can't be forgotten at compile-time.
   */
  readonly marker: MiddlewareMarker;
}

interface MiddlewareOKResult<_TContextOverride> extends MiddlewareResultBase {
  ok: true;
  data: unknown;
  // this could be extended with `input`/`rawInput` later
}

interface MiddlewareErrorResult<_TContextOverride>
  extends MiddlewareResultBase {
  ok: false;
  error: TRPCError;
}

/**
 * @internal
 */
export type MiddlewareResult<_TContextOverride> =
  | MiddlewareErrorResult<_TContextOverride>
  | MiddlewareOKResult<_TContextOverride>;

/**
 * @internal
 */
export interface MiddlewareBuilder<
  TContext,
  TMeta,
  TContextOverrides,
  TInputOut,
> {
  /**
   * Create a new builder based on the current middleware builder
   */
  unstable_pipe<$ContextOverridesOut>(
    fn:
      | MiddlewareFunction<
          TContext,
          TMeta,
          TContextOverrides,
          $ContextOverridesOut,
          TInputOut
        >
      | MiddlewareBuilder<
          Overwrite<TContext, TContextOverrides>,
          TMeta,
          $ContextOverridesOut,
          TInputOut
        >,
  ): MiddlewareBuilder<
    TContext,
    TMeta,
    Overwrite<TContextOverrides, $ContextOverridesOut>,
    TInputOut
  >;

  /**
   * List of middlewares within this middleware builder
   */
  _middlewares: MiddlewareFunction<
    TContext,
    TMeta,
    TContextOverrides,
    object,
    TInputOut
  >[];
}

/**
 * @internal
 */
export type MiddlewareFunction<
  TContext,
  TMeta,
  TContextOverridesIn,
  $ContextOverridesOut,
  TInputOut,
> = {
  (opts: {
    ctx: Simplify<Overwrite<TContext, TContextOverridesIn>>;
    type: ProcedureType;
    path: string;
    input: TInputOut;
    getRawInput: GetRawInputFn;
    meta: TMeta | undefined;
    next: {
      (): Promise<MiddlewareResult<TContextOverridesIn>>;
      <$ContextOverride>(opts: {
        ctx?: $ContextOverride;
        input?: unknown;
      }): Promise<MiddlewareResult<$ContextOverride>>;
      (opts: { getRawInput: GetRawInputFn }): Promise<
        MiddlewareResult<TContextOverridesIn>
      >;
    };
  }): Promise<MiddlewareResult<$ContextOverridesOut>>;
  _type?: string | undefined;
};

export type AnyMiddlewareFunction = MiddlewareFunction<any, any, any, any, any>;
export type AnyMiddlewareBuilder = MiddlewareBuilder<any, any, any, any>;
/**
 * @internal
 */
export function createMiddlewareFactory<
  TContext,
  TMeta,
  TInputOut = unknown,
>() {
  function createMiddlewareInner(
    middlewares: AnyMiddlewareFunction[],
  ): AnyMiddlewareBuilder {
    return {
      _middlewares: middlewares,
      unstable_pipe(middlewareBuilderOrFn) {
        const pipedMiddleware =
          '_middlewares' in middlewareBuilderOrFn
            ? middlewareBuilderOrFn._middlewares
            : [middlewareBuilderOrFn];

        return createMiddlewareInner([...middlewares, ...pipedMiddleware]);
      },
    };
  }

  function createMiddleware<$ContextOverrides>(
    fn: MiddlewareFunction<
      TContext,
      TMeta,
      object,
      $ContextOverrides,
      TInputOut
    >,
  ): MiddlewareBuilder<TContext, TMeta, $ContextOverrides, TInputOut> {
    return createMiddlewareInner([fn]);
  }

  return createMiddleware;
}

/**
 * Create a standalone middleware
 * @link https://trpc.io/docs/v11/server/middlewares#experimental-standalone-middlewares
 * @deprecated use `.unstable_concat()` instead
 */
export const experimental_standaloneMiddleware = <
  TCtx extends {
    ctx?: object;
    meta?: object;
    input?: unknown;
  },
>() => ({
  create: createMiddlewareFactory<
    TCtx extends { ctx: infer T extends object } ? T : any,
    TCtx extends { meta: infer T extends object } ? T : object,
    TCtx extends { input: infer T } ? T : unknown
  >(),
});

/**
 * @internal
 * Please note, `trpc-openapi` uses this function.
 */
export function createInputMiddleware<TInput>(parse: ParseFn<TInput>) {
  const inputMiddleware: AnyMiddlewareFunction =
    async function inputValidatorMiddleware(opts) {
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
        isObject(opts.input) && isObject(parsedInput)
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
  const outputMiddleware: AnyMiddlewareFunction =
    async function outputValidatorMiddleware({ next }) {
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
