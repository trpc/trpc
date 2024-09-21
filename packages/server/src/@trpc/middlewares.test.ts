/////////////// utils, should be external /////////////////

import z from 'zod';
import { getCauseFromUnknown } from '../unstable-core-do-not-import/error/TRPCError';
import type {
  inferParser,
  ParseFn,
  Parser,
} from '../unstable-core-do-not-import/parser';
import type {
  GetRawInputFn,
  MaybePromise,
  Overwrite,
  Simplify,
  TypeError,
} from '../unstable-core-do-not-import/types';
import {
  isObject,
  type UnsetMarker,
} from '../unstable-core-do-not-import/utils';

type DefaultValue<TValue, TFallback> = TValue extends UnsetMarker
  ? TFallback
  : TValue;

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

interface MiddlewareOptions {
  ctx: any;
  ctx_overrides: any;

  meta: any;

  input_in: any;
  input_out: any;

  output_in: any;
  output_out: any;
}

/**
 * @internal
 */
export type MiddlewareFunction<
  TOptions extends MiddlewareOptions,
  $ContextOverridesOut,
> = {
  (opts: {
    ctx: Simplify<Overwrite<TOptions['ctx'], TOptions['ctx_overrides']>>;

    path: string;
    input: TOptions['input_out'];
    getRawInput: GetRawInputFn;
    meta: TOptions['meta'] | undefined;
    next: {
      (): Promise<MiddlewareResult<TOptions['ctx_overrides']>>;
      <$ContextOverride>(opts: {
        ctx?: $ContextOverride;
        input?: unknown;
      }): Promise<MiddlewareResult<$ContextOverride>>;
      (opts: { getRawInput: GetRawInputFn }): Promise<
        MiddlewareResult<TOptions['ctx_overrides']>
      >;
    };
  }): Promise<MiddlewareResult<$ContextOverridesOut>>;
  _type?: string | undefined;
};

/**
 * Procedure resolver options (what the `.query()`, `.mutation()`, and `.subscription()` functions receive)
 * @internal
 */
export interface MiddlewareResolverOptions<TOptions extends MiddlewareOptions> {
  ctx: Simplify<Overwrite<TOptions['ctx'], TOptions['ctx_overrides']>>;
  input: TOptions['input_out'] extends UnsetMarker
    ? undefined
    : TOptions['input_out'];
}

type MiddlewareResolver<TOptions extends MiddlewareOptions, $Output> = (
  opts: MiddlewareResolverOptions<TOptions>,
) => MaybePromise<
  // If an output parser is defined, we need to return what the parser expects, otherwise we return the inferred type
  DefaultValue<TOptions['output_in'], $Output>
>;

export type AnyMiddlewareFunction = MiddlewareFunction<any, any>;

type IntersectIfDefined<TType, TWith> = TType extends UnsetMarker
  ? TWith
  : TWith extends UnsetMarker
  ? TType
  : Simplify<TType & TWith>;

/**
 * @internal
 */
export function createMiddlewareBuilder<TContext, TMeta>() {
  return null as never as MiddlewareBuilder<{
    ctx: TContext;
    ctx_overrides: object;
    meta: TMeta;
    input_in: UnsetMarker;
    input_out: UnsetMarker;
    output_in: UnsetMarker;
    output_out: UnsetMarker;
  }>;
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

interface MiddlewareCompleted<
  TOptions extends Pick<MiddlewareOptions, 'ctx' | 'input_in' | 'output_out'>,
> {
  _def: {
    $types: TOptions;
    middlewares: AnyMiddlewareFunction[];
  };
}
export interface MiddlewareBuilder<TOptions extends MiddlewareOptions> {
  _def: {
    $types: TOptions;
    middlewares: AnyMiddlewareFunction[];
  };
  /**
   * Add an input parser to the procedure.
   * @link https://trpc.io/docs/v11/server/validators
   */
  input: <$Parser extends Parser>(
    schema: TOptions['input_in'] extends UnsetMarker
      ? $Parser
      : inferParser<$Parser>['out'] extends Record<string, unknown> | undefined
      ? TOptions['input_in'] extends Record<string, unknown> | undefined
        ? undefined extends inferParser<$Parser>['out'] // if current is optional the previous must be too
          ? undefined extends TOptions['input_in']
            ? $Parser
            : TypeError<'Cannot chain an optional parser to a required parser'>
          : $Parser
        : TypeError<'All input parsers did not resolve to an object'>
      : TypeError<'All input parsers did not resolve to an object'>,
  ) => MiddlewareBuilder<
    Overwrite<
      TOptions,
      {
        input_in: IntersectIfDefined<
          TOptions['input_in'],
          inferParser<$Parser>['in']
        >;
        input_out: IntersectIfDefined<
          TOptions['input_out'],
          inferParser<$Parser>['out']
        >;
      }
    >
  >;
  /**
   * Add an output parser to the procedure.
   * @link https://trpc.io/docs/v11/server/validators
   */
  output: <$Parser extends Parser>(
    schema: $Parser,
  ) => MiddlewareBuilder<
    Overwrite<
      TOptions,
      {
        output_in: IntersectIfDefined<
          TOptions['output_in'],
          inferParser<$Parser>['in']
        >;
        output_out: IntersectIfDefined<
          TOptions['output_out'],
          inferParser<$Parser>['out']
        >;
      }
    >
  >;
  /**
   * Add a meta data to the procedure.
   * @link https://trpc.io/docs/v11/server/metadata
   */
  meta: (meta: TOptions['meta']) => MiddlewareBuilder<TOptions>;
  /**
   * Add a middleware to the procedure.
   * @link https://trpc.io/docs/v11/server/middlewares
   */
  use: <$ContextOverridesOut>(
    fn: MiddlewareFunction<TOptions, $ContextOverridesOut>,
  ) => MiddlewareBuilder<
    Overwrite<
      TOptions,
      {
        ctx_overrides: Overwrite<
          TOptions['ctx_overrides'],
          $ContextOverridesOut
        >;
      }
    >
  >;
  /**
   * Concat two middleware builders
   */
  concat: <$Options extends MiddlewareOptions>(
    builder: Overwrite<
      TOptions['ctx'],
      $Options['ctx_overrides']
    > extends $Options['ctx']
      ? $Options['meta'] extends TOptions['meta']
        ? MiddlewareBuilder<$Options>
        : TypeError<'Meta mismatch'>
      : TypeError<'Context mismatch'>,
  ) => MiddlewareBuilder<
    Overwrite<
      TOptions,
      {
        ctx: TOptions['ctx'];
        meta: TOptions['meta'];
        ctx_overrides: Overwrite<
          TOptions['ctx_overrides'],
          $Options['ctx_overrides']
        >;
        input_in: IntersectIfDefined<
          TOptions['input_in'],
          $Options['input_in']
        >;
        input_out: IntersectIfDefined<
          TOptions['input_out'],
          $Options['input_out']
        >;
        output_in: IntersectIfDefined<
          TOptions['output_in'],
          $Options['output_in']
        >;
        output_out: IntersectIfDefined<
          TOptions['output_out'],
          $Options['output_out']
        >;
      }
    >
  >;
  return: <$Output>(
    fn: MiddlewareResolver<TOptions, $Output>,
  ) => MiddlewareCompleted<{
    ctx: TOptions['ctx'];
    input_in: TOptions['input_in'];
    output_out: $Output;
  }>;
}

test('middleware builder', () => {
  interface Context {
    foo: string;
  }
  interface Meta {
    bar: string;
  }

  const mw = createMiddlewareBuilder<Context, Meta>();

  mw.input(
    z.object({
      foo: z.string(),
    }),
  )
    .input(
      z.object({
        lengthOf: z.string().transform((it) => it.length),
      }),
    )
    .use((opts) =>
      opts.next({
        ctx: {
          bar: 'bar',
        },
      }),
    )
    .use((opts) => {
      opts.ctx.bar;
      expectTypeOf(opts.ctx).toEqualTypeOf<{
        foo: string;
        bar: string;
      }>();
      expectTypeOf(opts.meta).toEqualTypeOf<Meta | undefined>();
      expectTypeOf(opts.input).toEqualTypeOf<{
        foo: string;
        lengthOf: number;
      }>();

      return opts.next();
    });
});

test('middleware builder returns', () => {
  const mw = createMiddlewareBuilder<object, object>();

  const res = mw.input(z.object({ foo: z.string() })).return((opts) => {
    return opts.input.foo;
  });
});

test('concat', () => {
  const a = createMiddlewareBuilder<object, object>().input(
    z.object({ foo: z.string() }),
  );
  const b = createMiddlewareBuilder<object, object>().input(
    z.object({ bar: z.string() }),
  );

  const concat = a.concat(b);

  expectTypeOf(concat._def.$types.input_in).toEqualTypeOf<{
    foo: string;
    bar: string;
  }>();
});
