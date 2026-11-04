import type { inferObservableValue, Observable } from '../observable';
import type { ProcedureErrorFormatter } from './error/formatter';
import { getTRPCErrorFromUnknown, TRPCError } from './error/TRPCError';
import type {
  AnyMiddlewareFunction,
  MiddlewareBuilder,
  MiddlewareFunction,
  MiddlewareResult,
} from './middleware';
import {
  createErrorFormatterMiddleware,
  createInputMiddleware,
  createOutputMiddleware,
  middlewareMarker,
} from './middleware';
import type { inferParser, Parser } from './parser';
import { getParseFn } from './parser';
import type {
  AnyMutationProcedure,
  AnyProcedure,
  AnyQueryProcedure,
  LegacyObservableSubscriptionProcedure,
  MutationProcedure,
  ProcedureType,
  QueryProcedure,
  SubscriptionProcedure,
} from './procedure';
import type { AnyRootTypes, RootConfig } from './rootConfig';
import { isDevDefault } from './rootConfig';
import type { TRPCErrorShape } from './rpc';
import type { inferTrackedOutput } from './stream/tracked';
import type {
  GetRawInputFn,
  MaybePromise,
  Overwrite,
  Simplify,
  TypeError,
} from './types';
import type { UnsetMarker } from './utils';
import { mergeWithoutOverrides } from './utils';

type IntersectIfDefined<TType, TWith> = TType extends UnsetMarker
  ? TWith
  : TWith extends UnsetMarker
    ? TType
    : Simplify<TType & TWith>;

type IsOutputObject<TType> = [TType] extends [
  Record<string, unknown> | undefined,
]
  ? true
  : false;

type CanMergeOutputs<TType, TWith> = [TType] extends [UnsetMarker]
  ? true
  : [TWith] extends [UnsetMarker]
    ? true
    : IsOutputObject<TType> extends true
      ? IsOutputObject<TWith>
      : false;

type MergeOutput<TType, TWith> = [TType] extends [UnsetMarker]
  ? TWith
  : [TWith] extends [UnsetMarker]
    ? TType
    : IsOutputObject<TType> extends true
      ? IsOutputObject<TWith> extends true
        ?
            | Simplify<
                Overwrite<Exclude<TType, undefined>, Exclude<TWith, undefined>>
              >
            | (undefined extends TType
                ? undefined extends TWith
                  ? undefined
                  : never
                : never)
        : TypeError<'All output parsers did not resolve to an object'>
      : TypeError<'All output parsers did not resolve to an object'>;

type DefaultValue<TValue, TFallback> = TValue extends UnsetMarker
  ? TFallback
  : TValue;

type FoldErrorShape<TErrorShape, $Shape> =
  | Extract<$Shape, TRPCErrorShape>
  | TErrorShape;

type inferAsyncIterable<TOutput> =
  TOutput extends AsyncIterable<infer $Yield, infer $Return, infer $Next>
    ? {
        yield: $Yield;
        return: $Return;
        next: $Next;
      }
    : never;
type inferSubscriptionOutput<TOutput> =
  TOutput extends AsyncIterable<any>
    ? AsyncIterable<
        inferTrackedOutput<inferAsyncIterable<TOutput>['yield']>,
        inferAsyncIterable<TOutput>['return'],
        inferAsyncIterable<TOutput>['next']
      >
    : TypeError<'Subscription output could not be inferred'>;

export type CallerOverride<TContext> = (opts: {
  args: unknown[];
  invoke: (opts: ProcedureCallOptions<TContext>) => Promise<unknown>;
  _def: AnyProcedure['_def'];
}) => Promise<unknown>;
type ProcedureBuilderDef<TMeta> = {
  procedure: true;
  inputs: Parser[];
  outputs: Parser[];
  meta?: TMeta;
  resolver?: ProcedureBuilderResolver;
  middlewares: AnyMiddlewareFunction[];
  /**
   * @deprecated use `type` instead
   */
  mutation?: boolean;
  /**
   * @deprecated use `type` instead
   */
  query?: boolean;
  /**
   * @deprecated use `type` instead
   */
  subscription?: boolean;
  type?: ProcedureType;
  caller?: CallerOverride<unknown>;
  config?: RootConfig<AnyRootTypes>;
};

type AnyProcedureBuilderDef = ProcedureBuilderDef<any>;

/**
 * What a resolver passed to `.query()`, `.mutation()` or `.subscription()`
 * gets.
 * @internal
 */
export interface ProcedureResolverOptions<
  TContext,
  _TMeta,
  TContextOverridesIn,
  TInputOut,
> {
  /** The context, after middlewares have added to or changed it. */
  ctx: Simplify<Overwrite<TContext, TContextOverridesIn>>;
  /**
   * The input, after the validators and any middleware that replaced it
   * with `next({ input })`.
   */
  input: TInputOut extends UnsetMarker ? undefined : TInputOut;
  /**
   * Aborts when the client cancels the request or disconnects.
   */
  signal: AbortSignal | undefined;
  /**
   * The procedure's path, such as `post.byId`.
   */
  path: string;
  /**
   * The call's zero-based index in its batch. A call that wasn't batched
   * gets `0`.
   */
  batchIndex?: number;
}

/**
 * A procedure resolver
 */
type ProcedureResolver<
  TContext,
  TMeta,
  TContextOverrides,
  TInputOut,
  TOutputParserIn,
  $Output,
> = (
  opts: ProcedureResolverOptions<TContext, TMeta, TContextOverrides, TInputOut>,
) => MaybePromise<
  // If an output parser is defined, we need to return what the parser expects, otherwise we return the inferred type
  DefaultValue<TOutputParserIn, $Output>
>;

type AnyResolver = ProcedureResolver<any, any, any, any, any, any>;
export type AnyProcedureBuilder = ProcedureBuilder<
  any,
  any,
  any,
  any,
  any,
  any,
  any,
  any,
  any
>;

/**
 * The options a resolver built from this procedure builder gets: its
 * `ctx`, `input` and so on. Use it to type helpers that resolvers call.
 * @see https://trpc.io/docs/server/procedures#inferProcedureBuilderResolverOptions
 */
export type inferProcedureBuilderResolverOptions<
  TProcedureBuilder extends AnyProcedureBuilder,
> =
  TProcedureBuilder extends ProcedureBuilder<
    infer TContext,
    infer TMeta,
    infer TContextOverrides,
    infer _TInputIn,
    infer TInputOut,
    infer _TOutputIn,
    infer _TOutputOut,
    infer _TCaller,
    infer _TErrorShape
  >
    ? ProcedureResolverOptions<
        TContext,
        TMeta,
        TContextOverrides,
        TInputOut extends UnsetMarker
          ? // if input is not set, we don't want to infer it as `undefined` since a procedure further down the chain might have set an input
            unknown
          : TInputOut extends object
            ? Simplify<
                TInputOut & {
                  /**
                   * Extra input params might have been added by a `.input()` further down the chain
                   */
                  [keyAddedByInputCallFurtherDown: string]: unknown;
                }
              >
            : TInputOut
      >
    : never;

/**
 * Builds a procedure step by step. Each method returns a new builder, so a
 * builder can be the base of many procedures.
 * @see https://trpc.io/docs/server/procedures
 */
export interface ProcedureBuilder<
  TContext,
  TMeta,
  TContextOverrides,
  TInputIn,
  TInputOut,
  TOutputIn,
  TOutputOut,
  TCaller extends boolean,
  /**
   * Defaults to `unknown` so that an annotation written without it falls back
   * to the router-wide error shape rather than pinning the procedure to the
   * default one.
   * @see inferProcedureErrorShape
   */
  TErrorShape = unknown,
> {
  /**
   * Adds a validator for the input. Chain several to merge object inputs.
   * @see https://trpc.io/docs/server/validators#input-validators
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
  ): ProcedureBuilder<
    TContext,
    TMeta,
    TContextOverrides,
    IntersectIfDefined<TInputIn, inferParser<$Parser>['in']>,
    IntersectIfDefined<TInputOut, inferParser<$Parser>['out']>,
    TOutputIn,
    TOutputOut,
    TCaller,
    TErrorShape
  >;
  /**
   * Adds a validator for the output, which checks what the resolver
   * returns.
   * @see https://trpc.io/docs/server/validators#output-validators
   */
  output<$Parser extends Parser>(
    schema: TOutputOut extends UnsetMarker
      ? $Parser
      : inferParser<$Parser>['out'] extends Record<string, unknown> | undefined
        ? TOutputOut extends Record<string, unknown> | undefined
          ? undefined extends inferParser<$Parser>['out'] // if current is optional the previous must be too
            ? undefined extends TOutputOut
              ? $Parser
              : TypeError<'Cannot chain an optional parser to a required parser'>
            : $Parser
          : TypeError<'All output parsers did not resolve to an object'>
        : TypeError<'All output parsers did not resolve to an object'>,
  ): ProcedureBuilder<
    TContext,
    TMeta,
    TContextOverrides,
    TInputIn,
    TInputOut,
    IntersectIfDefined<TOutputIn, inferParser<$Parser>['in']>,
    MergeOutput<TOutputOut, inferParser<$Parser>['out']>,
    TCaller,
    TErrorShape
  >;
  /**
   * Sets the procedure's metadata, which middlewares can read. It's
   * shallow-merged with any metadata set before.
   * @see https://trpc.io/docs/server/metadata
   */
  meta(
    meta: TMeta,
  ): ProcedureBuilder<
    TContext,
    TMeta,
    TContextOverrides,
    TInputIn,
    TInputOut,
    TOutputIn,
    TOutputOut,
    TCaller,
    TErrorShape
  >;
  /**
   * Adds an error formatter for this procedure. An error goes to the last
   * `.errors()` formatter first, and on to earlier ones and the root
   * `errorFormatter` until one returns a shape. A formatter only sees
   * errors from the steps after it, so put `.errors()` before `.input()`
   * to format input errors.
   * @see https://trpc.io/docs/server/error-formatting#per-procedure-error-formatting
   */
  errors<$Shape extends TRPCErrorShape | undefined | void>(
    formatter: ProcedureErrorFormatter<TContext, TContextOverrides, $Shape>,
  ): ProcedureBuilder<
    TContext,
    TMeta,
    TContextOverrides,
    TInputIn,
    TInputOut,
    TOutputIn,
    TOutputOut,
    TCaller,
    FoldErrorShape<TErrorShape, $Shape>
  >;
  /**
   * Adds a middleware, which runs before the resolver and can change the
   * context.
   * @see https://trpc.io/docs/server/middlewares
   */
  use<$ContextOverridesOut>(
    fn:
      | MiddlewareBuilder<
          Overwrite<TContext, TContextOverrides>,
          TMeta,
          $ContextOverridesOut,
          TInputOut
        >
      | MiddlewareFunction<
          TContext,
          TMeta,
          TContextOverrides,
          $ContextOverridesOut,
          TInputOut
        >,
  ): ProcedureBuilder<
    TContext,
    TMeta,
    Overwrite<TContextOverrides, $ContextOverridesOut>,
    TInputIn,
    TInputOut,
    TOutputIn,
    TOutputOut,
    TCaller,
    TErrorShape
  >;

  /**
   * @deprecated Use {@link concat} instead.
   */
  unstable_concat<
    $Context,
    $Meta,
    $ContextOverrides,
    $InputIn,
    $InputOut,
    $OutputIn,
    $OutputOut,
    $ErrorShape,
  >(
    builder: Overwrite<TContext, TContextOverrides> extends $Context
      ? TMeta extends $Meta
        ? CanMergeOutputs<TOutputOut, $OutputOut> extends true
          ? ProcedureBuilder<
              $Context,
              $Meta,
              $ContextOverrides,
              $InputIn,
              $InputOut,
              $OutputIn,
              $OutputOut,
              TCaller,
              $ErrorShape
            >
          : TypeError<'All output parsers did not resolve to an object'>
        : TypeError<'Meta mismatch'>
      : TypeError<'Context mismatch'>,
  ): ProcedureBuilder<
    TContext,
    TMeta,
    Overwrite<TContextOverrides, $ContextOverrides>,
    IntersectIfDefined<TInputIn, $InputIn>,
    IntersectIfDefined<TInputOut, $InputOut>,
    IntersectIfDefined<TOutputIn, $OutputIn>,
    MergeOutput<TOutputOut, $OutputOut>,
    TCaller,
    FoldErrorShape<TErrorShape, $ErrorShape>
  >;

  /**
   * Adds another procedure builder's inputs, middlewares and context to
   * this one. Useful for plugins that ship their own procedure builder.
   * @see https://trpc.io/docs/server/middlewares#concat
   */
  concat<
    $Context,
    $Meta,
    $ContextOverrides,
    $InputIn,
    $InputOut,
    $OutputIn,
    $OutputOut,
    $ErrorShape,
  >(
    builder: Overwrite<TContext, TContextOverrides> extends $Context
      ? TMeta extends $Meta
        ? CanMergeOutputs<TOutputOut, $OutputOut> extends true
          ? ProcedureBuilder<
              $Context,
              $Meta,
              $ContextOverrides,
              $InputIn,
              $InputOut,
              $OutputIn,
              $OutputOut,
              TCaller,
              $ErrorShape
            >
          : TypeError<'All output parsers did not resolve to an object'>
        : TypeError<'Meta mismatch'>
      : TypeError<'Context mismatch'>,
  ): ProcedureBuilder<
    TContext,
    TMeta,
    Overwrite<TContextOverrides, $ContextOverrides>,
    IntersectIfDefined<TInputIn, $InputIn>,
    IntersectIfDefined<TInputOut, $InputOut>,
    IntersectIfDefined<TOutputIn, $OutputIn>,
    MergeOutput<TOutputOut, $OutputOut>,
    TCaller,
    FoldErrorShape<TErrorShape, $ErrorShape>
  >;
  /**
   * Ends the builder with a query: a procedure that reads data.
   * @see https://trpc.io/docs/server/procedures#writing-procedures
   */
  query<$Output>(
    resolver: ProcedureResolver<
      TContext,
      TMeta,
      TContextOverrides,
      TInputOut,
      TOutputIn,
      $Output
    >,
  ): TCaller extends true
    ? (
        input: DefaultValue<TInputIn, void>,
      ) => Promise<DefaultValue<TOutputOut, $Output>>
    : QueryProcedure<{
        input: DefaultValue<TInputIn, void>;
        output: DefaultValue<TOutputOut, $Output>;
        meta: TMeta;
        errorShape: TErrorShape;
      }>;

  /**
   * Ends the builder with a mutation: a procedure that changes data.
   * @see https://trpc.io/docs/server/procedures#writing-procedures
   */
  mutation<$Output>(
    resolver: ProcedureResolver<
      TContext,
      TMeta,
      TContextOverrides,
      TInputOut,
      TOutputIn,
      $Output
    >,
  ): TCaller extends true
    ? (
        input: DefaultValue<TInputIn, void>,
      ) => Promise<DefaultValue<TOutputOut, $Output>>
    : MutationProcedure<{
        input: DefaultValue<TInputIn, void>;
        output: DefaultValue<TOutputOut, $Output>;
        meta: TMeta;
        errorShape: TErrorShape;
      }>;

  /**
   * Ends the builder with a subscription: a procedure that streams events
   * from an async iterable, such as an async generator.
   * @see https://trpc.io/docs/server/subscriptions
   */
  subscription<$Output extends AsyncIterable<any, void, any>>(
    resolver: ProcedureResolver<
      TContext,
      TMeta,
      TContextOverrides,
      TInputOut,
      TOutputIn,
      $Output
    >,
  ): TCaller extends true
    ? TypeError<'Not implemented'>
    : SubscriptionProcedure<{
        input: DefaultValue<TInputIn, void>;
        output: inferSubscriptionOutput<DefaultValue<TOutputOut, $Output>>;
        meta: TMeta;
        errorShape: TErrorShape;
      }>;
  /**
   * Ends the builder with a subscription that returns an observable.
   * @deprecated Return an async generator instead. Observable subscriptions
   * will be removed in v12.
   * @see https://trpc.io/docs/server/subscriptions
   */
  subscription<$Output extends Observable<any, any>>(
    resolver: ProcedureResolver<
      TContext,
      TMeta,
      TContextOverrides,
      TInputOut,
      TOutputIn,
      $Output
    >,
  ): TCaller extends true
    ? TypeError<'Not implemented'>
    : LegacyObservableSubscriptionProcedure<{
        input: DefaultValue<TInputIn, void>;
        output: inferObservableValue<DefaultValue<TOutputOut, $Output>>;
        meta: TMeta;
        errorShape: TErrorShape;
      }>;
  /**
   * Replaces how the procedure is called, for example to make it a server
   * action. Experimental: it may change in any release.
   * @see https://trpc.io/docs/client/nextjs/server-actions#1-define-a-base-procedure-with-experimental_caller
   */
  experimental_caller(
    caller: CallerOverride<TContext>,
  ): ProcedureBuilder<
    TContext,
    TMeta,
    TContextOverrides,
    TInputIn,
    TInputOut,
    TOutputIn,
    TOutputOut,
    true,
    TErrorShape
  >;
  /**
   * @internal
   */
  _def: ProcedureBuilderDef<TMeta>;
}

type ProcedureBuilderResolver = (
  opts: ProcedureResolverOptions<any, any, any, any>,
) => Promise<unknown>;

function createNewBuilder(
  def1: AnyProcedureBuilderDef,
  def2: Partial<AnyProcedureBuilderDef>,
): AnyProcedureBuilder {
  const { middlewares = [], inputs, outputs, meta, config, ...rest } = def2;
  const mergedMiddlewares = [...def1.middlewares, ...middlewares];
  const mergedOutputs = [...def1.outputs, ...(outputs ?? [])];
  let outputIndex = 0;
  const combinedMiddlewares =
    mergedOutputs.length > 1
      ? mergedMiddlewares.map((middleware) => {
          if (middleware._type !== 'output') {
            return middleware;
          }
          const output = mergedOutputs[outputIndex++];
          if (!output) {
            throw new Error('Output middleware/parser count mismatch');
          }
          return createOutputMiddleware(
            getParseFn(output),
            true,
            outputIndex === mergedOutputs.length,
          );
        })
      : mergedMiddlewares;

  // TODO: maybe have a fn here to warn about calls
  return createBuilder({
    ...mergeWithoutOverrides(def1, rest),
    config: def1.config ?? config,
    inputs: [...def1.inputs, ...(inputs ?? [])],
    outputs: mergedOutputs,
    middlewares: combinedMiddlewares,
    meta: def1.meta && meta ? { ...def1.meta, ...meta } : (meta ?? def1.meta),
  });
}

export function createBuilder<TContext, TMeta, TErrorShape = unknown>(
  initDef: Partial<AnyProcedureBuilderDef> = {},
): ProcedureBuilder<
  TContext,
  TMeta,
  object,
  UnsetMarker,
  UnsetMarker,
  UnsetMarker,
  UnsetMarker,
  false,
  TErrorShape
> {
  const _def: AnyProcedureBuilderDef = {
    procedure: true,
    inputs: [],
    outputs: [],
    middlewares: [],
    ...initDef,
  };

  const builder: AnyProcedureBuilder = {
    _def,
    input(input) {
      const parser = getParseFn(input as Parser);
      return createNewBuilder(_def, {
        inputs: [input as Parser],
        middlewares: [createInputMiddleware(parser)],
      });
    },
    output(output: Parser | TypeError<string>) {
      const parser = getParseFn(output as Parser);
      return createNewBuilder(_def, {
        outputs: [output as Parser],
        middlewares: [createOutputMiddleware(parser)],
      });
    },
    meta(meta) {
      return createNewBuilder(_def, {
        meta,
      });
    },
    errors(formatter) {
      return createNewBuilder(_def, {
        middlewares: [
          createErrorFormatterMiddleware(
            formatter,
            _def.config?.isDev ?? isDevDefault(),
          ),
        ],
      });
    },
    use(middlewareBuilderOrFn) {
      // Distinguish between a middleware builder and a middleware function
      const middlewares =
        '_middlewares' in middlewareBuilderOrFn
          ? middlewareBuilderOrFn._middlewares
          : [middlewareBuilderOrFn];

      return createNewBuilder(_def, {
        middlewares: middlewares,
      });
    },
    unstable_concat(builder) {
      return createNewBuilder(_def, (builder as AnyProcedureBuilder)._def);
    },
    concat(builder) {
      return createNewBuilder(_def, (builder as AnyProcedureBuilder)._def);
    },
    query(resolver) {
      return createResolver(
        { ..._def, type: 'query' },
        resolver,
      ) as AnyQueryProcedure;
    },
    mutation(resolver) {
      return createResolver(
        { ..._def, type: 'mutation' },
        resolver,
      ) as AnyMutationProcedure;
    },
    subscription(resolver: ProcedureResolver<any, any, any, any, any, any>) {
      return createResolver({ ..._def, type: 'subscription' }, resolver) as any;
    },
    experimental_caller(caller) {
      return createNewBuilder(_def, {
        caller,
      }) as any;
    },
  };

  return builder;
}

function createResolver(
  _defIn: AnyProcedureBuilderDef & { type: ProcedureType },
  resolver: AnyResolver,
) {
  const finalBuilder = createNewBuilder(_defIn, {
    resolver,
    middlewares: [
      async function resolveMiddleware(opts) {
        const data = await resolver(opts);
        return {
          marker: middlewareMarker,
          ok: true,
          data,
          ctx: opts.ctx,
        } as const;
      },
    ],
  });
  const _def: AnyProcedure['_def'] = {
    ...finalBuilder._def,
    type: _defIn.type,
    experimental_caller: Boolean(finalBuilder._def.caller),
    meta: finalBuilder._def.meta,
    $types: null as any,
  };

  const invoke = createProcedureCaller(finalBuilder._def);
  const callerOverride = finalBuilder._def.caller;
  if (!callerOverride) {
    return invoke;
  }
  const callerWrapper = async (...args: unknown[]) => {
    return await callerOverride({
      args,
      invoke,
      _def: _def,
    });
  };

  callerWrapper._def = _def;

  return callerWrapper;
}

/**
 * What calling a procedure takes.
 * @internal
 */
export interface ProcedureCallOptions<TContext> {
  ctx: TContext;
  getRawInput: GetRawInputFn;
  input?: unknown;
  path: string;
  type: ProcedureType;
  signal: AbortSignal | undefined;
  /**
   * The index of this call in a batch request.
   */
  batchIndex: number;
}

const codeblock = `
This is a client-only function.
If you want to call this function on the server, see https://trpc.io/docs/server/server-side-calls
`.trim();

// run the middlewares recursively with the resolver as the last one
async function callRecursive(
  index: number,
  _def: AnyProcedureBuilderDef,
  opts: ProcedureCallOptions<any>,
): Promise<MiddlewareResult<any>> {
  try {
    // oxlint-disable-next-line typescript/no-non-null-assertion
    const middleware = _def.middlewares[index]!;
    const result = await middleware({
      ...opts,
      meta: _def.meta,
      input: opts.input,
      next(_nextOpts?: any) {
        const nextOpts = _nextOpts as
          | {
              ctx?: Record<string, unknown>;
              input?: unknown;
              getRawInput?: GetRawInputFn;
            }
          | undefined;

        return callRecursive(index + 1, _def, {
          ...opts,
          ctx: nextOpts?.ctx ? { ...opts.ctx, ...nextOpts.ctx } : opts.ctx,
          input: nextOpts && 'input' in nextOpts ? nextOpts.input : opts.input,
          getRawInput: nextOpts?.getRawInput ?? opts.getRawInput,
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
}

function createProcedureCaller(_def: AnyProcedureBuilderDef): AnyProcedure {
  async function procedure(opts: ProcedureCallOptions<unknown>) {
    // is direct server-side call
    if (!opts || !('getRawInput' in opts)) {
      throw new Error(codeblock);
    }

    // there's always at least one "next" since we wrap this.resolver in a middleware
    const result = await callRecursive(0, _def, opts);

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

  procedure._def = _def;
  procedure.procedure = true;
  procedure.meta = _def.meta;

  // FIXME typecast shouldn't be needed - fixittt
  return procedure as unknown as AnyProcedure;
}
