import { FlatOverwrite, MaybePromise, Simplify } from '../../types';
import {
  MiddlewareFunction,
  createInputMiddleware,
  createOutputMiddleware,
} from '../middleware';
import { Parser, inferParser } from '../parser';
import {
  AnyMutationProcedure,
  AnyProcedure,
  AnyQueryProcedure,
  AnySubscriptionProcedure,
  Procedure,
  ProcedureParams,
  callProcedureInner,
} from '../procedure';
import { ProcedureType } from '../types';
import { AnyRootConfig } from './config';
import { getParseFn } from './getParseFn';
import { mergeWithoutOverrides } from './mergeWithoutOverrides';
import {
  DefaultValue as FallbackValue,
  Overwrite,
  OverwriteKnown,
  ResolveOptions,
  UnsetMarker,
  middlewareMarker,
} from './utils';

type CreateProcedureReturnInput<
  TPrev extends ProcedureParams,
  TNext extends ProcedureParams,
> = ProcedureBuilder<{
  _config: TPrev['_config'];
  _meta: TPrev['_meta'];
  _ctx_out: Overwrite<TPrev['_ctx_out'], TNext['_ctx_out']>;
  _input_in: FallbackValue<TNext['_input_in'], TPrev['_input_in']>;
  _input_out: FallbackValue<TNext['_input_out'], TPrev['_input_out']>;
  _output_in: FallbackValue<TNext['_output_in'], TPrev['_output_in']>;
  _output_out: FallbackValue<TNext['_output_out'], TPrev['_output_out']>;
}>;

/**
 * @internal
 */
export interface BuildProcedure<
  TType extends ProcedureType,
  TParams extends ProcedureParams,
  TOutput,
> extends Procedure<
    TType,
    UnsetMarker extends TParams['_output_out']
      ? OverwriteKnown<
          TParams,
          {
            _output_in: TOutput;
            _output_out: TOutput;
          }
        >
      : TParams
  > {}

type OverwriteIfDefined<TType, TWith> = UnsetMarker extends TType
  ? TWith
  : Simplify<FlatOverwrite<TType, TWith>>;

type ErrorMessage<TMessage extends string> = TMessage;

export type ProcedureBuilderDef<TParams extends ProcedureParams> = {
  inputs: Parser[];
  output?: Parser;
  meta?: TParams['_meta'];
  resolver?: ProcedureBuilderResolver;
  middlewares: ProcedureBuilderMiddleware[];
  mutation?: boolean;
  query?: boolean;
  subscription?: boolean;
};

export type AnyProcedureBuilderDef = ProcedureBuilderDef<any>;

export interface ProcedureBuilder<TParams extends ProcedureParams> {
  /**
   * Add an input parser to the procedure.
   */
  input<$Parser extends Parser>(
    schema: TParams['_input_out'] extends UnsetMarker
      ? $Parser
      : inferParser<$Parser>['out'] extends Record<string, unknown>
      ? TParams['_input_out'] extends Record<string, unknown>
        ? $Parser
        : ErrorMessage<'All input parsers did not resolve to an object'>
      : ErrorMessage<'All input parsers did not resolve to an object'>,
  ): ProcedureBuilder<{
    _config: TParams['_config'];
    _meta: TParams['_meta'];
    _ctx_out: TParams['_ctx_out'];
    _input_in: OverwriteIfDefined<
      TParams['_input_in'],
      inferParser<$Parser>['in']
    >;
    _input_out: OverwriteIfDefined<
      TParams['_input_out'],
      inferParser<$Parser>['out']
    >;

    _output_in: TParams['_output_in'];
    _output_out: TParams['_output_out'];
  }>;
  /**
   * Add an output parser to the procedure.
   */
  output<$Parser extends Parser>(
    schema: $Parser,
  ): ProcedureBuilder<{
    _config: TParams['_config'];
    _meta: TParams['_meta'];
    _ctx_out: TParams['_ctx_out'];
    _input_in: TParams['_input_in'];
    _input_out: TParams['_input_out'];
    _output_in: inferParser<$Parser>['in'];
    _output_out: inferParser<$Parser>['out'];
  }>;
  /**
   * Add a meta data to the procedure.
   */
  meta(meta: TParams['_meta']): ProcedureBuilder<TParams>;
  /**
   * Add a middleware to the procedure.
   */
  use<$Params extends ProcedureParams>(
    fn: MiddlewareFunction<TParams, $Params>,
  ): CreateProcedureReturnInput<TParams, $Params>;
  /**
   * Extend the procedure with another procedure.
   * @warning The TypeScript inference fails when chaining concatenated procedures.
   */
  unstable_concat<$ProcedureBuilder extends AnyProcedureBuilder>(
    proc: $ProcedureBuilder,
  ): $ProcedureBuilder extends ProcedureBuilder<infer $TParams>
    ? CreateProcedureReturnInput<TParams, $TParams>
    : never;
  /**
   * Query procedure
   */
  query<$Output>(
    resolver: (
      opts: ResolveOptions<TParams>,
    ) => MaybePromise<FallbackValue<TParams['_output_in'], $Output>>,
  ): BuildProcedure<'query', TParams, $Output>;

  /**
   * Mutation procedure
   */
  mutation<$Output>(
    resolver: (
      opts: ResolveOptions<TParams>,
    ) => MaybePromise<FallbackValue<TParams['_output_in'], $Output>>,
  ): BuildProcedure<'mutation', TParams, $Output>;

  /**
   * Mutation procedure
   */
  subscription<$Output>(
    resolver: (
      opts: ResolveOptions<TParams>,
    ) => MaybePromise<FallbackValue<TParams['_output_in'], $Output>>,
  ): BuildProcedure<'subscription', TParams, $Output>;
  /**
   * @internal
   */
  _def: ProcedureBuilderDef<TParams>;
}

type AnyProcedureBuilder = ProcedureBuilder<any>;

export type ProcedureBuilderMiddleware = MiddlewareFunction<any, any>;

export type ProcedureBuilderResolver = (
  opts: ResolveOptions<any>,
) => Promise<unknown>;

function createNewBuilder(
  def1: AnyProcedureBuilderDef,
  def2: Partial<AnyProcedureBuilderDef>,
) {
  const { middlewares = [], inputs, ...rest } = def2;

  // TODO: maybe have a fn here to warn about calls
  return createBuilder({
    ...mergeWithoutOverrides(def1, rest),
    inputs: [...def1.inputs, ...(inputs ?? [])],
    middlewares: [...def1.middlewares, ...middlewares],
  } as any);
}

export function createBuilder<TConfig extends AnyRootConfig>(
  initDef?: AnyProcedureBuilderDef,
): ProcedureBuilder<{
  _config: TConfig;
  _ctx_out: TConfig['$types']['ctx'];
  _input_in: UnsetMarker;
  _input_out: UnsetMarker;
  _output_in: UnsetMarker;
  _output_out: UnsetMarker;
  _meta: TConfig['$types']['meta'];
}> {
  const _def: AnyProcedureBuilderDef = initDef || {
    inputs: [],
    middlewares: [],
  };

  return {
    _def,
    input(input) {
      const parser = getParseFn(input);
      return createNewBuilder(_def, {
        inputs: [input],
        middlewares: [createInputMiddleware(parser)],
      }) as AnyProcedureBuilder;
    },
    output(output: Parser) {
      const parseOutput = getParseFn(output);
      return createNewBuilder(_def, {
        output,
        middlewares: [createOutputMiddleware(parseOutput)],
      }) as AnyProcedureBuilder;
    },
    meta(meta) {
      return createNewBuilder(_def, {
        meta: meta as Record<string, unknown>,
      }) as AnyProcedureBuilder;
    },
    unstable_concat(builder) {
      return createNewBuilder(_def, builder._def) as any;
    },
    use(middleware) {
      return createNewBuilder(_def, {
        middlewares: [middleware],
      }) as AnyProcedureBuilder;
    },
    query(resolver) {
      return createResolver(
        { ..._def, query: true },
        resolver,
      ) as AnyQueryProcedure;
    },
    mutation(resolver) {
      return createResolver(
        { ..._def, mutation: true },
        resolver,
      ) as AnyMutationProcedure;
    },
    subscription(resolver) {
      return createResolver(
        { ..._def, subscription: true },
        resolver,
      ) as AnySubscriptionProcedure;
    },
  };
}

function createResolver(
  _def: AnyProcedureBuilderDef,
  resolver: (opts: ResolveOptions<any>) => MaybePromise<any>,
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
  rawInput: unknown;
  input?: unknown;
  path: string;
  type: ProcedureType;
}

function createProcedureCaller(_def: AnyProcedureBuilderDef): AnyProcedure {
  let type: ProcedureType = 'query';
  if (_def.mutation) {
    type = 'mutation';
  } else if (_def.subscription) {
    type = 'subscription';
  }

  const procedure = ((input: any, ctx: any) => {
    return callProcedureInner(procedure, {
      ctx,
      rawInput: input,
      path: '',
      type,
    });
  }) as AnyProcedure;

  procedure._def = _def;
  procedure.meta = _def.meta;

  return procedure;
}
