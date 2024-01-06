import { getTRPCErrorFromUnknown, TRPCError } from '../../error/TRPCError';
import { MaybePromise, Simplify } from '../../types';
import {
  AnyMiddlewareFunction,
  createInputMiddleware,
  createOutputMiddleware,
  MiddlewareBuilder,
  MiddlewareFunction,
  MiddlewareResult,
} from '../middleware';
import {
  inferParser,
  InputParserCallback,
  OutputParserCallback,
  Parser,
} from '../parser';
import {
  AnyMutationProcedure,
  AnyProcedure,
  AnyQueryProcedure,
  AnySubscriptionProcedure,
  MutationProcedure,
  QueryProcedure,
  SubscriptionProcedure,
} from '../procedure';
import { ProcedureType } from '../types';
import { mergeWithoutOverrides } from './mergeWithoutOverrides';
import {
  DefaultValue,
  GetRawInputFn,
  middlewareMarker,
  Overwrite,
  UnsetMarker,
} from './utils';

type IntersectIfDefined<TType, TWith> = UnsetMarker extends TType
  ? TWith
  : Simplify<TType & TWith>;

export type ProcedureBuilderDef<TMeta> = {
  procedure: true;
  inputs: (Parser | InputParserCallback<any, any>)[];
  output?: Parser | OutputParserCallback<any, any>;
  meta?: TMeta;
  resolver?: ProcedureBuilderResolver;
  middlewares: AnyMiddlewareFunction[];
  mutation?: boolean;
  query?: boolean;
  subscription?: boolean;
};

export type AnyProcedureBuilderDef = ProcedureBuilderDef<any>;

/**
 * Procedure resolver options
 * @internal
 */
interface ResolverOptions<TContext, _TMeta, TContextOverridesIn, TInputOut> {
  ctx: Simplify<Overwrite<TContext, TContextOverridesIn>>;
  input: TInputOut extends UnsetMarker ? undefined : TInputOut;
}

/**
 * A procedure resolver
 */
type ProcedureResolver<
  TContext,
  _TMeta,
  TContextOverrides,
  TInputOut,
  TOutputIn,
  TOutputOut,
> = (opts: {
  ctx: Simplify<Overwrite<TContext, TContextOverrides>>;
  input: TInputOut extends UnsetMarker ? undefined : TInputOut;
}) => MaybePromise<DefaultValue<TOutputIn, TOutputOut>>;

type AnyResolver = ProcedureResolver<any, any, any, any, any, any>;
export interface ProcedureBuilder<
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
   * @see https://trpc.io/docs/server/validators
   */
  input<$Parser extends Parser | InputParserCallback<TContext, any>>(
    schema: $Parser,
  ): ProcedureBuilder<
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
   * @see https://trpc.io/docs/server/validators
   */
  output<$Parser extends Parser | OutputParserCallback<TContext, any>>(
    schema: $Parser,
  ): ProcedureBuilder<
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
    TOutputOut
  >;
  /**
   * Add a middleware to the procedure.
   * @see https://trpc.io/docs/server/middlewares
   */
  use<$ContextOverridesOut>(
    fn:
      | MiddlewareBuilder<
          Overwrite<TContext, TContextOverrides>,
          TMeta,
          $ContextOverridesOut,
          TInputIn
        >
      | MiddlewareFunction<
          TContext,
          TMeta,
          TContextOverrides,
          $ContextOverridesOut,
          TInputIn
        >,
  ): ProcedureBuilder<
    TContext,
    TMeta,
    Overwrite<TContextOverrides, $ContextOverridesOut>,
    TInputIn,
    TInputOut,
    TOutputIn,
    TOutputOut
  >;
  /**
   * Query procedure
   * @see https://trpc.io/docs/concepts#vocabulary
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
  ): QueryProcedure<{
    input: DefaultValue<TInputIn, void>;
    output: DefaultValue<TOutputOut, $Output>;
  }>;

  /**
   * Mutation procedure
   * @see https://trpc.io/docs/concepts#vocabulary
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
  ): MutationProcedure<{
    input: DefaultValue<TInputIn, void>;
    output: DefaultValue<TOutputOut, $Output>;
  }>;

  /**
   * Subscription procedure
   * @see https://trpc.io/docs/concepts#vocabulary
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
  ): SubscriptionProcedure<{
    input: DefaultValue<TInputIn, void>;
    output: DefaultValue<TOutputOut, $Output>;
  }>;
  /**
   * @internal
   */
  _def: ProcedureBuilderDef<TMeta>;
}

type AnyProcedureBuilder = ProcedureBuilder<any, any, any, any, any, any, any>;
export type ProcedureBuilderResolver = (
  opts: ResolverOptions<any, any, any, any>,
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
  UnsetMarker
> {
  const _def: AnyProcedureBuilderDef = {
    procedure: true,
    inputs: [],
    middlewares: [],
    ...initDef,
  };

  type AnyProcedureBuilder = ProcedureBuilder<
    any,
    any,
    any,
    any,
    any,
    any,
    any
  >;

  const builder: AnyProcedureBuilder = {
    _def,
    input(inputParserOrCb) {
      return createNewBuilder(_def, {
        inputs: [inputParserOrCb],
        middlewares: [createInputMiddleware(inputParserOrCb)],
      });
    },
    output(outputParserOrCb) {
      return createNewBuilder(_def, {
        output: outputParserOrCb,
        middlewares: [createOutputMiddleware(outputParserOrCb)],
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
  };

  return builder;
}

function createResolver(
  _def: AnyProcedureBuilderDef & { type: ProcedureType },
  resolver: AnyResolver,
) {
  const finalBuilder = createNewBuilder(_def, {
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

  return createProcedureCaller(finalBuilder._def);
}

/**
 * @internal
 */
export interface ProcedureCallOptions {
  ctx: unknown;
  getRawInput: GetRawInputFn;
  input?: unknown;
  path: string;
  type: ProcedureType;
}

const codeblock = `
This is a client-only function.
If you want to call this function on the server, see https://trpc.io/docs/server/server-side-calls
`.trim();

function createProcedureCaller(_def: AnyProcedureBuilderDef): AnyProcedure {
  async function procedure(opts: ProcedureCallOptions) {
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
