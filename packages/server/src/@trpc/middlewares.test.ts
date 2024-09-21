/////////////// utils, should be external /////////////////

import z from 'zod';
import { getCauseFromUnknown } from '../unstable-core-do-not-import/error/TRPCError';
import type {
  inferParser,
  ParseFn,
  Parser,
} from '../unstable-core-do-not-import/parser';
import type { TypeError } from '../unstable-core-do-not-import/types';
import {
  isObject,
  type UnsetMarker,
} from '../unstable-core-do-not-import/utils';

/**
 * See https://github.com/microsoft/TypeScript/issues/41966#issuecomment-758187996
 * Fixes issues with iterating over keys of objects with index signatures.
 * Without this, iterations over keys of objects with index signatures will lose
 * type information about the keys and only the index signature will remain.
 * @internal
 */
type WithoutIndexSignature<TObj> = {
  [K in keyof TObj as string extends K
    ? never
    : number extends K
    ? never
    : K]: TObj[K];
};

type Overwrite<TType, TWith> = TWith extends any
  ? TType extends object
    ? {
        [K in  // Exclude index signature from keys
          | keyof WithoutIndexSignature<TType>
          | keyof WithoutIndexSignature<TWith>]: K extends keyof TWith
          ? TWith[K]
          : K extends keyof TType
          ? TType[K]
          : never;
      } & (string extends keyof TWith // Handle cases with an index signature
        ? { [key: string]: TWith[string] }
        : number extends keyof TWith
        ? { [key: number]: TWith[number] }
        : // eslint-disable-next-line @typescript-eslint/ban-types
          {})
    : TWith
  : never;

/**
 * @internal
 * Returns the raw input type of a procedure
 */
export type GetRawInputFn = () => Promise<unknown>;

/**
 * @internal
 * @link https://github.com/ianstormtaylor/superstruct/blob/7973400cd04d8ad92bbdc2b6f35acbfb3c934079/src/utils.ts#L323-L325
 */
export type Simplify<TType> = TType extends any[] | Date
  ? TType
  : { [K in keyof TType]: TType[K] };

///////////////////// implementation /////////////////////

type MiddlewareErrorType = 'OUTPUT' | 'INPUT';

class MiddlewareError extends Error {
  // eslint-disable-next-line @typescript-eslint/ban-ts-comment
  // @ts-ignore override doesn't work in all environments due to "This member cannot have an 'override' modifier because it is not declared in the base class 'Error'"
  public override readonly cause?: Error;

  constructor(opts: {
    message?: string;
    cause: unknown;
    type: MiddlewareErrorType;
  }) {
    const cause = getCauseFromUnknown(opts?.cause);

    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
    // @ts-ignore https://github.com/tc39/proposal-error-cause
    super(opts.message ?? cause?.message, { cause });

    this.name = 'MiddlewareError';

    if (!this.cause) {
      // < ES2022 / < Node 16.9.0 compatability
      this.cause = cause;
    }
  }
}

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
  error: MiddlewareError;
}

/** @internal */
export const middlewareMarker = 'middlewareMarker' as 'middlewareMarker' & {
  __brand: 'middlewareMarker';
};
type MiddlewareMarker = typeof middlewareMarker;

/**
 * @internal
 */
export type MiddlewareResult<_TContextOverride> =
  | MiddlewareErrorResult<_TContextOverride>
  | MiddlewareOKResult<_TContextOverride>;

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

type IntersectIfDefined<TType, TWith> = TType extends UnsetMarker
  ? TWith
  : TWith extends UnsetMarker
  ? TType
  : Simplify<TType & TWith>;

/**
 * @internal
 */
export function createMiddlewareBuilder<TContext, TMeta>() {
  return null as never as MiddlewareBuilder<
    TContext,
    TMeta,
    object,
    UnsetMarker,
    UnsetMarker,
    UnsetMarker,
    UnsetMarker
  >;
}

/**
 * @internal
 */
export function createInputMiddleware<TInput>(parse: ParseFn<TInput>) {
  const inputMiddleware: AnyMiddlewareFunction =
    async function inputValidatorMiddleware(opts) {
      let parsedInput: ReturnType<typeof parse>;

      const rawInput = await opts.getRawInput();
      try {
        parsedInput = await parse(rawInput);
      } catch (cause) {
        throw new MiddlewareError({
          cause,
          type: 'INPUT',
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
        throw new MiddlewareError({
          cause,
          type: 'OUTPUT',
        });
      }
    };
  outputMiddleware._type = 'output';
  return outputMiddleware;
}

export interface MiddlewareBuilder<
  TContext,
  TMeta,
  TContextOverrides,
  TInputIn,
  TInputOut,
  TOutputIn,
  TOutputOut,
> {
  /**
   * Add an input parser to the procedure.
   * @link https://trpc.io/docs/v11/server/validators
   */
  input<$Parser extends Parser>(
    schema: TInputOut extends UnsetMarker
      ? $Parser
      : inferParser<$Parser>['out'] extends Record<string, unknown> | undefined
      ? TInputOut extends Record<string, unknown> | undefined
        ? undefined extends inferParser<$Parser>['out'] // if current is optional the previous must be too
          ? undefined extends TInputOut
            ? $Parser
            : TypeError<'Cannot chain an optional parser to a required parser'>
          : $Parser
        : TypeError<'All input parsers did not resolve to an object'>
      : TypeError<'All input parsers did not resolve to an object'>,
  ): MiddlewareBuilder<
    TContext,
    TMeta,
    TContextOverrides,
    IntersectIfDefined<TInputIn, inferParser<$Parser>['in']>,
    IntersectIfDefined<TInputOut, inferParser<$Parser>['out']>,
    TOutputIn,
    TOutputOut
  >;
  /**
   * Add an output parser to the procedure.
   * @link https://trpc.io/docs/v11/server/validators
   */
  output<$Parser extends Parser>(
    schema: $Parser,
  ): MiddlewareBuilder<
    TContext,
    TMeta,
    TContextOverrides,
    TInputIn,
    TInputOut,
    IntersectIfDefined<TOutputIn, inferParser<$Parser>['in']>,
    IntersectIfDefined<TOutputOut, inferParser<$Parser>['out']>
  >;
  /**
   * Add a meta data to the procedure.
   * @link https://trpc.io/docs/v11/server/metadata
   */
  meta(
    meta: TMeta,
  ): MiddlewareBuilder<
    TContext,
    TMeta,
    TContextOverrides,
    TInputIn,
    TInputOut,
    TOutputIn,
    TOutputOut
  >;
  /**
   * Add a middleware to the procedure.
   * @link https://trpc.io/docs/v11/server/middlewares
   */
  use<$ContextOverridesOut>(
    fn: MiddlewareFunction<
      TContext,
      TMeta,
      TContextOverrides,
      $ContextOverridesOut,
      TInputOut
    >,
  ): MiddlewareBuilder<
    TContext,
    TMeta,
    Overwrite<TContextOverrides, $ContextOverridesOut>,
    TInputIn,
    TInputOut,
    TOutputIn,
    TOutputOut
  >;

  /**
   * Combine two procedure builders
   */
  unstable_concat<
    $Context,
    $Meta,
    $ContextOverrides,
    $InputIn,
    $InputOut,
    $OutputIn,
    $OutputOut,
  >(
    builder: Overwrite<TContext, TContextOverrides> extends $Context
      ? TMeta extends $Meta
        ? MiddlewareBuilder<
            $Context,
            $Meta,
            $ContextOverrides,
            $InputIn,
            $InputOut,
            $OutputIn,
            $OutputOut
          >
        : TypeError<'Meta mismatch'>
      : TypeError<'Context mismatch'>,
  ): MiddlewareBuilder<
    TContext,
    TMeta,
    Overwrite<TContextOverrides, $ContextOverrides>,
    IntersectIfDefined<TInputIn, $InputIn>,
    IntersectIfDefined<TInputIn, $InputOut>,
    IntersectIfDefined<TOutputIn, $OutputIn>,
    IntersectIfDefined<TOutputOut, $OutputOut>
  >;
}

test('middleware builder', () => {
  type Context = {
    foo: string;
  };
  type Meta = {
    bar: string;
  };

  const mw = createMiddlewareBuilder<Context, Meta>();

  mw.input(z.object({ foo: z.string() }))
    .use((opts) =>
      opts.next({
        ctx: {
          bar: 'bar',
        },
      }),
    )
    .use((opts) => {
      expectTypeOf(opts.ctx).toEqualTypeOf<{
        foo: string;
        bar: string;
      }>();
      expectTypeOf(opts.meta).toEqualTypeOf<Meta | undefined>();

      return opts.next();
    });
});
