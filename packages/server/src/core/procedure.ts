import { MiddlewareFunction } from './middleware';
import { Parser, inferParser } from './parser';
import { Params } from './utils';
import {
  DefaultValue as FallbackValue,
  Overwrite,
  ProcedureMarker,
  UnsetMarker,
} from './utils';

// type ProcedureBuilder
type MaybePromise<T> = T | Promise<T>;
interface ResolveOptions<TParams extends Params> {
  ctx: TParams['_ctx_out'];
  input: TParams['_input_out'];
}

type ClientContext = Record<string, unknown>;
type ProcedureOptions<TInput extends { input?: unknown }> = {
  context?: ClientContext;
} & TInput;

export type Procedure<TParams extends Params> =
  (TParams['_input_in'] extends UnsetMarker
    ? (
        opts?: ProcedureOptions<{ input?: undefined }>,
      ) => Promise<TParams['_output_out']>
    : TParams['_input_in'] extends undefined
    ? (
        opts?: ProcedureOptions<{ input?: TParams['_input_in'] }>,
      ) => Promise<TParams['_output_out']>
    : (
        opts: ProcedureOptions<{ input: TParams['_input_in'] }>,
      ) => Promise<TParams['_output_out']>) &
    ProcedureMarker;

type CreateProcedureReturnInput<
  TPrev extends Params,
  TNext extends Params,
> = ProcedureBuilder<{
  _meta: TPrev['_meta'];
  _ctx_in: TPrev['_ctx_in'];
  _ctx_out: Overwrite<TPrev['_ctx_out'], TNext['_ctx_out']>;
  _input_out: FallbackValue<TNext['_input_out'], TPrev['_input_out']>;
  _input_in: FallbackValue<TNext['_input_in'], TPrev['_input_in']>;
  _output_in: FallbackValue<TNext['_output_in'], TPrev['_output_in']>;
  _output_out: FallbackValue<TNext['_output_out'], TPrev['_output_out']>;
}>;

export interface ProcedureBuilder<TParams extends Params> {
  /**
   * Add an input parser to the procedure.
   */
  input<$TParser extends Parser>(
    schema: $TParser,
  ): ProcedureBuilder<{
    _meta: TParams['_meta'];
    _ctx_in: TParams['_ctx_in'];
    _ctx_out: TParams['_ctx_out'];
    _output_in: TParams['_output_in'];
    _output_out: TParams['_output_out'];
    _input_in: inferParser<$TParser>['in'];
    _input_out: inferParser<$TParser>['out'];
  }>;
  /**
   * Add an output parser to the procedure.
   */
  output<$TParser extends Parser>(
    schema: $TParser,
  ): ProcedureBuilder<{
    _meta: TParams['_meta'];
    _ctx_in: TParams['_ctx_in'];
    _ctx_out: TParams['_ctx_out'];
    _input_in: TParams['_input_in'];
    _input_out: TParams['_input_out'];
    _output_in: inferParser<$TParser>['in'];
    _output_out: inferParser<$TParser>['out'];
  }>;
  /**
   * Add a meta data to the procedure.
   */
  meta(meta: TParams['_meta']): ProcedureBuilder<TParams>;
  /**
   * Add a middleware to the procedure.
   */
  use<$TParams extends Params>(
    fn: MiddlewareFunction<TParams, $TParams>,
  ): CreateProcedureReturnInput<TParams, $TParams>;
  /**
   * Extend the procedure with another procedure
   */
  concat<$ProcedureReturnInput extends ProcedureBuilder<any>>(
    proc: $ProcedureReturnInput,
  ): $ProcedureReturnInput extends ProcedureBuilder<infer $TParams>
    ? CreateProcedureReturnInput<TParams, $TParams>
    : never;
  /**
   * Resolve the procedure
   */
  resolve<$TOutput>(
    resolver: (
      opts: ResolveOptions<TParams>,
    ) => MaybePromise<FallbackValue<TParams['_output_in'], $TOutput>>,
  ): UnsetMarker extends TParams['_output_out']
    ? Procedure<
        Overwrite<
          TParams,
          {
            _output_in: $TOutput;
            _output_out: $TOutput;
          }
        >
      >
    : Procedure<TParams>;
}

export interface ProcedureBuilderInternal {
  _def: {
    input: null | Parser;
    output: null | Parser;
    meta: null | Record<string, unknown>;
    resolver: null | ((opts: ResolveOptions<any>) => Promise<unknown>);
    middlewares: MiddlewareFunction<any, any>[];
  };
  /**
   * @internal
   */
  input: (parser: Parser) => ProcedureBuilderInternal;
  /**
   * @internal
   */
  output: (parser: Parser) => ProcedureBuilderInternal;
  /**
   * @internal
   */
  concat: (proc: ProcedureBuilderInternal) => ProcedureBuilderInternal;
  /**
   * @internal
   */
  use: (fn: MiddlewareFunction<any, any>) => ProcedureBuilderInternal;
  /**
   * @internal
   */
  meta: (meta: Record<string, unknown>) => ProcedureBuilderInternal;
  /**
   * @internal
   */
  resolve: (resolver: () => MaybePromise<any>) => ProcedureBuilderInternal;
}

/**
 * Ensures there are no duplicate keys when building a procedure.
 */
function assertNoDuplicates<T extends Record<string, unknown>>(
  obj1: T,
  obj2: Partial<T>,
): T {
  for (const key in obj2) {
    if (
      obj1[key as keyof typeof obj1] !== null &&
      obj2[key as keyof typeof obj2] !== null
    ) {
      throw new Error(`Duplicate ${key}`);
    }
  }
  return {
    ...obj1,
    ...obj2,
  };
}

function createNewInternalBuilder(
  def1: ProcedureBuilderInternal['_def'],
  def2: Partial<ProcedureBuilderInternal['_def']>,
): ProcedureBuilderInternal {
  const { middlewares = [], ...rest } = def2;

  return createInternalBuilder({
    ...assertNoDuplicates(def1, rest),
    middlewares: [...def1.middlewares, ...middlewares],
  });
}

/**
 * @internal
 */
export function createInternalBuilder(
  initDef?: ProcedureBuilderInternal['_def'],
): ProcedureBuilderInternal {
  const _def: ProcedureBuilderInternal['_def'] = initDef || {
    input: null,
    output: null,
    meta: null,
    resolver: null,
    middlewares: [],
  };

  // TODO: maybe wrap in Proxy to prevent server-side calls since
  return {
    _def,
    input(input: Parser) {
      return createNewInternalBuilder(_def, { input });
    },
    output(output: Parser) {
      return createNewInternalBuilder(_def, { output });
    },
    meta(meta) {
      return createNewInternalBuilder(_def, { meta });
    },
    resolve(resolver) {
      return createNewInternalBuilder(_def, { resolver });
    },
    concat(builder) {
      return createNewInternalBuilder(_def, builder._def);
    },
    use(middleware) {
      return createNewInternalBuilder(_def, {
        middlewares: [middleware],
      });
    },
  };
}

export function createBuilder<TContext, TMeta>(): ProcedureBuilder<{
  _ctx_in: TContext;
  _ctx_out: TContext;
  _input_out: UnsetMarker;
  _input_in: UnsetMarker;
  _output_in: UnsetMarker;
  _output_out: UnsetMarker;
  _meta: TMeta;
}> {
  return createInternalBuilder() as any;
}

// FIXME: Delete or use me
// interface UnwrappedProcedure<TParams extends Params> {
//   _params: TParams;
//   meta: TParams['_meta'];
//   call(opts: {
//     ctx: TParams['_ctx_in'];
//     input: TParams['_input_in'];
//   }): Promise<TParams['_output_out']>;
// }

// /**
//  * For server-side calls
//  */
// export function unwrapProcedure<TParams extends Params>(
//   procedure: Procedure<TParams>,
// ) {
//   return procedure as any as UnwrappedProcedure<TParams>;
// }
