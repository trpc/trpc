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
import { inferParser, Parser } from '../parser';
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
import { AnyRootConfig } from './config';
import { getParseFn } from './getParseFn';
import { mergeWithoutOverrides } from './mergeWithoutOverrides';
import {
  DefaultValue,
  GetRawInputFn,
  middlewareMarker,
  Overwrite,
  UnsetMarker,
} from './utils';

type OverwriteIfDefined<TType, TWith> = UnsetMarker extends TType
  ? TWith
  : Simplify<TType & TWith>;

type ErrorMessage<TMessage extends string> = TMessage;

export type ProcedureBuilderDef<TConfig extends AnyRootConfig> = {
  procedure: true;
  inputs: Parser[];
  output?: Parser;
  meta?: TConfig['$types']['meta'];
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
interface ResolverOptions<
  TConfig extends AnyRootConfig,
  TContextOverridesIn,
  TInputOut,
> {
  ctx: Simplify<Overwrite<TConfig['$types']['ctx'], TContextOverridesIn>>;
  input: TInputOut extends UnsetMarker ? undefined : TInputOut;
}

export interface ProcedureBuilder<
  TConfig extends AnyRootConfig,
  TContextOverrides,
  TInputIn,
  TInputOut,
  TOutputIn,
  TOutputOut,
> {
  /**
   * Add an input parser to the procedure.
   */
  input<$Parser extends Parser>(
    schema: TInputIn extends UnsetMarker
      ? $Parser
      : inferParser<$Parser>['out'] extends Record<string, unknown> | undefined
      ? TInputIn extends Record<string, unknown> | undefined
        ? undefined extends inferParser<$Parser>['out'] // if current is optional the previous must be too
          ? undefined extends TInputIn
            ? $Parser
            : ErrorMessage<'Cannot chain an optional parser to a required parser'>
          : $Parser
        : ErrorMessage<'All input parsers did not resolve to an object'>
      : ErrorMessage<'All input parsers did not resolve to an object'>,
  ): ProcedureBuilder<
    TConfig,
    TContextOverrides,
    OverwriteIfDefined<TInputIn, inferParser<$Parser>['in']>,
    OverwriteIfDefined<TInputOut, inferParser<$Parser>['out']>,
    TOutputIn,
    TOutputOut
  >;
  /**
   * Add an output parser to the procedure.
   */
  output<$Parser extends Parser>(
    schema: $Parser,
  ): ProcedureBuilder<
    TConfig,
    TContextOverrides,
    TInputIn,
    TInputOut,
    OverwriteIfDefined<TOutputIn, inferParser<$Parser>['in']>,
    OverwriteIfDefined<TOutputOut, inferParser<$Parser>['out']>
  >;
  /**
   * Add a meta data to the procedure.
   */
  meta(
    meta: TConfig['$types']['meta'],
  ): ProcedureBuilder<
    TConfig,
    TContextOverrides,
    TInputIn,
    TInputOut,
    TOutputIn,
    TOutputOut
  >;
  /**
   * Add a middleware to the procedure.
   */
  use<$ContextOverridesOut>(
    fn:
      | MiddlewareBuilder<
          Overwrite<TConfig['$types']['ctx'], TContextOverrides>,
          TConfig['$types']['meta'],
          $ContextOverridesOut,
          TInputIn
        >
      | MiddlewareFunction<
          TConfig['$types']['ctx'],
          TConfig['$types']['meta'],
          TContextOverrides,
          $ContextOverridesOut,
          TInputIn
        >,
  ): ProcedureBuilder<
    TConfig,
    Overwrite<TContextOverrides, $ContextOverridesOut>,
    TInputIn,
    TInputOut,
    TOutputIn,
    TOutputOut
  >;
  /**
   * Query procedure
   */
  query<$Output>(
    resolver: (
      opts: ResolverOptions<TConfig, TContextOverrides, TInputOut>,
    ) => MaybePromise<DefaultValue<TOutputIn, $Output>>,
  ): QueryProcedure<{
    input: DefaultValue<TInputIn, void>;
    output: DefaultValue<TOutputOut, $Output>;
  }>;

  /**
   * Mutation procedure
   */
  mutation<$Output>(
    resolver: (
      opts: ResolverOptions<TConfig, TContextOverrides, TInputOut>,
    ) => MaybePromise<DefaultValue<TOutputIn, $Output>>,
  ): MutationProcedure<{
    input: DefaultValue<TInputIn, void>;
    output: DefaultValue<TOutputOut, $Output>;
  }>;

  /**
   * Mutation procedure
   */
  subscription<$Output>(
    resolver: (
      opts: ResolverOptions<TConfig, TContextOverrides, TInputOut>,
    ) => MaybePromise<DefaultValue<TOutputIn, $Output>>,
  ): SubscriptionProcedure<{
    input: DefaultValue<TInputIn, void>;
    output: DefaultValue<TOutputOut, $Output>;
  }>;
  /**
   * @internal
   */
  _def: ProcedureBuilderDef<TConfig>;
}

export type ProcedureBuilderResolver = (
  opts: ResolverOptions<any, any, any>,
) => Promise<unknown>;

function createNewBuilder(
  def1: AnyProcedureBuilderDef,
  def2: Partial<AnyProcedureBuilderDef>,
) {
  const { middlewares = [], inputs, meta, ...rest } = def2;

  // TODO: maybe have a fn here to warn about calls
  return createBuilder({
    ...mergeWithoutOverrides(def1, rest),
    inputs: [...def1.inputs, ...(inputs ?? [])],
    middlewares: [...def1.middlewares, ...middlewares],
    meta: def1.meta && meta ? { ...def1.meta, ...meta } : meta ?? def1.meta,
  });
}

export function createBuilder<TConfig extends AnyRootConfig>(
  initDef: Partial<AnyProcedureBuilderDef> = {},
): ProcedureBuilder<
  TConfig,
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

  type AnyProcedureBuilder = ProcedureBuilder<any, any, any, any, any, any>;

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
      const parseOutput = getParseFn(output);
      return createNewBuilder(_def, {
        output,
        middlewares: [createOutputMiddleware(parseOutput)],
      });
    },
    meta(meta) {
      return createNewBuilder(_def, {
        meta: meta as Record<string, unknown>,
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
      }) as any;
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
  resolver: (opts: ResolverOptions<any, any, any>) => MaybePromise<any>,
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
If you want to call this function on the server, you do the following:
This is a client-only function.

const caller = appRouter.createCaller({
  /* ... your context */
});

const result = await caller.call('myProcedure', input);
`.trim();

function createProcedureCaller(_def: AnyProcedureBuilderDef): AnyProcedure {
  async function procedure(opts: ProcedureCallOptions) {
    // is direct server-side call
    if (!opts || !('getRawInput' in opts)) {
      throw new Error(codeblock);
    }

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
    };

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
