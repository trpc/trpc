import type { inferObservableValue } from '../observable';
import { getTRPCErrorFromUnknown, TRPCError } from './error/TRPCError';
import type {
  AnyMiddlewareFunction,
  MiddlewareBuilder,
  MiddlewareFunction,
  MiddlewareResult,
} from './middleware';
import {
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
  AnySubscriptionProcedure,
  MutationProcedure,
  ProcedureType,
  QueryProcedure,
  SubscriptionProcedure,
} from './procedure';
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
``;
type DefaultValue<TValue, TFallback> = TValue extends UnsetMarker
  ? TFallback
  : TValue;

type inferSubscriptionOutput<TOutput> = TOutput extends AsyncIterable<
  infer $Output
>
  ? inferTrackedOutput<$Output>
  : inferObservableValue<TOutput>;

export type CallerOverride<TContext> = (opts: {
  args: unknown[];
  invoke: (opts: ProcedureCallOptions<TContext>) => Promise<unknown>;
  _def: AnyProcedure['_def'];
}) => Promise<unknown>;
type ProcedureBuilderDef<TMeta> = {
  procedure: true;
  inputs: Parser[];
  output?: Parser;
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
};

type AnyProcedureBuilderDef = ProcedureBuilderDef<any>;

/**
 * Procedure resolver options (what the `.query()`, `.mutation()`, and `.subscription()` functions receive)
 * @internal
 */
export interface ProcedureResolverOptions<
  TContext,
  _TMeta,
  TContextOverridesIn,
  TInputOut,
> {
  ctx: Simplify<Overwrite<TContext, TContextOverridesIn>>;
  input: TInputOut extends UnsetMarker ? undefined : TInputOut;
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
  any
>;

/**
 * Infer the context type from a procedure builder
 * Useful to create common helper functions for different procedures
 */
export type inferProcedureBuilderResolverOptions<
  TProcedureBuilder extends AnyProcedureBuilder,
> = TProcedureBuilder extends ProcedureBuilder<
  infer TContext,
  infer TMeta,
  infer TContextOverrides,
  infer _TInputIn,
  infer TInputOut,
  infer _TOutputIn,
  infer _TOutputOut,
  infer _TCaller
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

export interface ProcedureBuilder<
  TContext,
  TMeta,
  TContextOverrides,
  TInputIn,
  TInputOut,
  TOutputIn,
  TOutputOut,
  TCaller extends boolean,
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
  ): ProcedureBuilder<
    TContext,
    TMeta,
    TContextOverrides,
    IntersectIfDefined<TInputIn, inferParser<$Parser>['in']>,
    IntersectIfDefined<TInputOut, inferParser<$Parser>['out']>,
    TOutputIn,
    TOutputOut,
    TCaller
  >;
  /**
   * Add an output parser to the procedure.
   * @link https://trpc.io/docs/v11/server/validators
   */
  output<$Parser extends Parser>(
    schema: $Parser,
  ): ProcedureBuilder<
    TContext,
    TMeta,
    TContextOverrides,
    TInputIn,
    TInputOut,
    IntersectIfDefined<TOutputIn, inferParser<$Parser>['in']>,
    IntersectIfDefined<TOutputOut, inferParser<$Parser>['out']>,
    TCaller
  >;
  /**
   * Add a meta data to the procedure.
   * @link https://trpc.io/docs/v11/server/metadata
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
    TCaller
  >;
  /**
   * Add a middleware to the procedure.
   * @link https://trpc.io/docs/v11/server/middlewares
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
    TCaller
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
        ? ProcedureBuilder<
            $Context,
            $Meta,
            $ContextOverrides,
            $InputIn,
            $InputOut,
            $OutputIn,
            $OutputOut,
            TCaller
          >
        : TypeError<'Meta mismatch'>
      : TypeError<'Context mismatch'>,
  ): ProcedureBuilder<
    TContext,
    TMeta,
    Overwrite<TContextOverrides, $ContextOverrides>,
    IntersectIfDefined<TInputIn, $InputIn>,
    IntersectIfDefined<TInputIn, $InputOut>,
    IntersectIfDefined<TOutputIn, $OutputIn>,
    IntersectIfDefined<TOutputOut, $OutputOut>,
    TCaller
  >;
  /**
   * Query procedure
   * @link https://trpc.io/docs/v11/concepts#vocabulary
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
      }>;

  /**
   * Mutation procedure
   * @link https://trpc.io/docs/v11/concepts#vocabulary
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
      }>;

  /**
   * Subscription procedure
   * @link https://trpc.io/docs/v11/concepts#vocabulary
   */
  subscription<$Output>(
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
        output: DefaultValue<TOutputOut, inferSubscriptionOutput<$Output>>;
      }>;

  /**
   * Overrides the way a procedure is invoked
   * Do not use this unless you know what you're doing - this is an experimental API
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
    true
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
  const { middlewares = [], inputs, meta, ...rest } = def2;

  // TODO: maybe have a fn here to warn about calls
  return createBuilder({
    ...mergeWithoutOverrides(def1, rest),
    inputs: [...def1.inputs, ...(inputs ?? [])],
    middlewares: [...def1.middlewares, ...middlewares],
    meta: def1.meta && meta ? { ...def1.meta, ...meta } : meta ?? def1.meta,
  });
}

export function createBuilder<TContext, TMeta>(
  initDef: Partial<AnyProcedureBuilderDef> = {},
): ProcedureBuilder<
  TContext,
  TMeta,
  object,
  UnsetMarker,
  UnsetMarker,
  UnsetMarker,
  UnsetMarker,
  false
> {
  const _def: AnyProcedureBuilderDef = {
    procedure: true,
    inputs: [],
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
    output(output: Parser) {
      const parser = getParseFn(output);
      return createNewBuilder(_def, {
        output,
        middlewares: [createOutputMiddleware(parser)],
      });
    },
    meta(meta) {
      return createNewBuilder(_def, {
        meta,
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
    subscription(resolver) {
      return createResolver(
        { ..._def, type: 'subscription' },
        resolver,
      ) as AnySubscriptionProcedure;
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
 * @internal
 */
export interface ProcedureCallOptions<TContext> {
  ctx: TContext;
  getRawInput: GetRawInputFn;
  input?: unknown;
  path: string;
  type: ProcedureType;
}

const codeblock = `
This is a client-only function.
If you want to call this function on the server, see https://trpc.io/docs/v11/server/server-side-calls
`.trim();

function createProcedureCaller(_def: AnyProcedureBuilderDef): AnyProcedure {
  async function procedure(opts: ProcedureCallOptions<unknown>) {
    // is direct server-side call
    if (!opts || !('getRawInput' in opts)) {
      throw new Error(codeblock);
    }

    // run the middlewares recursively with the resolver as the last one
    async function callRecursive(
      callOpts: {
        ctx: any;
        index: number;
        input?: unknown;
        getRawInput?: GetRawInputFn;
      } = {
        index: 0,
        ctx: opts.ctx,
      },
    ): Promise<MiddlewareResult<any>> {
      try {
        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        const middleware = _def.middlewares[callOpts.index]!;
        const result = await middleware({
          ctx: callOpts.ctx,
          type: opts.type,
          path: opts.path,
          getRawInput: callOpts.getRawInput ?? opts.getRawInput,
          meta: _def.meta,
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
    }

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

  procedure._def = _def;

  // FIXME typecast shouldn't be needed - fixittt
  return procedure as unknown as AnyProcedure;
}
