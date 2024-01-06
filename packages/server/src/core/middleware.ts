import { TRPCError } from '../error/TRPCError';
import { Simplify } from '../types';
import { getParseFn, getParseFnInner } from './internals/getParseFn';
import { GetRawInputFn, MiddlewareMarker, Overwrite } from './internals/utils';
import { InputParserCallback, OutputParserCallback, Parser } from './parser';
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
interface MiddlewareOKResult<_TContextOverride> extends MiddlewareResultBase {
  ok: true;
  data: unknown;
  // this could be extended with `input`/`rawInput` later
}

/**
 * @internal
 */
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
  TInputIn,
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
          TInputIn
        >
      | MiddlewareBuilder<
          Overwrite<TContext, TContextOverrides>,
          TMeta,
          $ContextOverridesOut,
          TInputIn
        >,
  ): MiddlewareBuilder<
    TContext,
    TMeta,
    Overwrite<TContextOverrides, $ContextOverridesOut>,
    TInputIn
  >;

  /**
   * List of middlewares within this middleware builder
   */
  _middlewares: MiddlewareFunction<
    TContext,
    TMeta,
    TContextOverrides,
    object,
    TInputIn
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
  TInputIn,
> = {
  (opts: {
    ctx: Simplify<Overwrite<TContext, TContextOverridesIn>>;
    type: ProcedureType;
    path: string;
    input: TInputIn;
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
export function createMiddlewareFactory<TContext, TMeta, TInputIn = unknown>() {
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
      TInputIn
    >,
  ): MiddlewareBuilder<TContext, TMeta, $ContextOverrides, TInputIn> {
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
    TCtx extends { ctx: infer T extends object } ? T : any,
    TCtx extends { meta: infer T extends object } ? T : object,
    TCtx extends { input: infer T } ? T : unknown
  >(),
});

function isPlainObject(obj: unknown) {
  return obj && typeof obj === 'object' && !Array.isArray(obj);
}

/**
 * @internal
 * Please note, `trpc-openapi` uses this function.
 */
export function createInputMiddleware(
  parserOrCb: Parser | InputParserCallback<any, any>,
) {
  const inputMiddleware: AnyMiddlewareFunction =
    async function inputValidatorMiddleware(opts) {
      let parsedInput: any;

      const rawInput = await opts.getRawInput();
      try {
        if (typeof parserOrCb === 'function') {
          const cbResult = await parserOrCb({ ctx: opts.ctx, input: rawInput });

          const parse = getParseFnInner(cbResult);

          if (parse !== null) {
            parsedInput = await parse(rawInput);
          } else {
            parsedInput = cbResult;
          }
        } else {
          const parser = parserOrCb;
          parsedInput = await getParseFn(parser)(rawInput);
        }
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
export function createOutputMiddleware(
  parserOrCb: Parser | OutputParserCallback<any, any>,
) {
  const outputMiddleware: AnyMiddlewareFunction =
    async function outputValidatorMiddleware(opts) {
      const result = await opts.next();
      if (!result.ok) {
        // pass through failures without validating
        return result;
      }
      try {
        let data: any;

        if (typeof parserOrCb === 'function') {
          const cbResult = await parserOrCb({
            ctx: opts.ctx,
            output: result.data,
          });

          const parse = getParseFnInner(cbResult);

          if (parse !== null) {
            data = await parse(result.data);
          } else {
            data = cbResult;
          }
        } else {
          const parser = parserOrCb;
          data = await getParseFn(parser)(result.data);
        }

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
