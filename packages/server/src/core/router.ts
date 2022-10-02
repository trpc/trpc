import { TRPCError } from '../error/TRPCError';
import {
  DefaultErrorShape,
  ErrorFormatter,
  defaultFormatter,
} from '../error/formatter';
import { getHTTPStatusCodeFromError } from '../http/internals/getHTTPStatusCode';
import { TRPCErrorShape, TRPC_ERROR_CODES_BY_KEY } from '../rpc';
import { createRecursiveProxy } from '../shared';
import { CombinedDataTransformer, defaultTransformer } from '../transformer';
import { RootConfig } from './internals/config';
import { mergeWithoutOverrides } from './internals/mergeWithoutOverrides';
import { omitPrototype } from './internals/omitPrototype';
import { ProcedureCallOptions } from './internals/procedureBuilder';
import {
  AnyMutationProcedure,
  AnyProcedure,
  AnyQueryProcedure,
  AnySubscriptionProcedure,
  ProcedureArgs,
} from './procedure';
import {
  ProcedureType,
  inferHandlerInput,
  inferProcedureOutput,
  procedureTypes,
} from './types';

/** @internal **/
export type ProcedureRecord = Record<string, AnyProcedure>;

export type ProcedureRouterRecord = Record<string, AnyProcedure | AnyRouter>;

export interface ProcedureStructure {
  queries: Record<string, AnyQueryProcedure>;
  mutations: Record<string, AnyMutationProcedure>;
  subscriptions: Record<string, AnySubscriptionProcedure>;
  procedures: ProcedureRecord;
}

export interface RouterDef<
  // FIXME this should use RootConfig
  TContext,
  TErrorShape extends TRPCErrorShape<number>,
  TMeta extends Record<string, unknown>,
  TRecord extends ProcedureRouterRecord,
> {
  router: true;
  /**
   * @internal
   */
  _ctx: TContext;
  /**
   * @internal
   */
  _errorShape: TErrorShape;
  /**
   * @internal
   */
  _meta: TMeta;
  errorFormatter: ErrorFormatter<TContext, TErrorShape>;
  transformer: CombinedDataTransformer;
  procedures: TRecord;
  record: TRecord;
  /**
   * V9 queries
   * @deprecated
   */
  queries: {};
  /**
   * V9 mutations
   * @deprecated
   */
  mutations: {};
  /**
   * V9 subscriptions
   * @deprecated
   */
  subscriptions: {};
}

export type AnyRouterDef<TContext = any> = RouterDef<TContext, any, any, any>;

/**
 * @internal
 */
type inferHandlerFn<TProcedures extends ProcedureRecord> = <
  TProcedure extends TProcedures[TPath],
  TPath extends keyof TProcedures & string,
>(
  path: TPath,
  ...args: inferHandlerInput<TProcedure>
) => Promise<inferProcedureOutput<TProcedure>>;

type DecorateProcedure<TProcedure extends AnyProcedure> = (
  input: ProcedureArgs<TProcedure['_def']>[0],
) => Promise<TProcedure['_def']['_output_out']>;

/**
 * @internal
 */
type DecoratedProcedureRecord<TProcedures extends ProcedureRouterRecord> = {
  [TKey in keyof TProcedures]: TProcedures[TKey] extends AnyRouter
    ? DecoratedProcedureRecord<TProcedures[TKey]['_def']['record']>
    : TProcedures[TKey] extends AnyProcedure
    ? DecorateProcedure<TProcedures[TKey]>
    : never;
};

/**
 * @internal
 */
type RouterCaller<TDef extends AnyRouterDef> = (ctx: TDef['_ctx']) => {
  /**
   * @deprecated
   */
  query: inferHandlerFn<TDef['queries']>;
  /**
   * @deprecated
   */
  mutation: inferHandlerFn<TDef['mutations']>;
  /**
   * @deprecated
   */
  subscription: inferHandlerFn<TDef['subscriptions']>;
} & DecoratedProcedureRecord<TDef['record']>;

export interface Router<TDef extends AnyRouterDef> {
  _def: TDef;
  /** @deprecated **/
  errorFormatter: TDef['errorFormatter'];
  /** @deprecated **/
  transformer: TDef['transformer'];
  createCaller: RouterCaller<TDef>;
  // FIXME rename me and deprecate
  getErrorShape(opts: {
    error: TRPCError;
    type: ProcedureType | 'unknown';
    path: string | undefined;
    input: unknown;
    ctx: undefined | TDef['_ctx'];
  }): TDef['_errorShape'];
}

/**
 * @internal
 */
export type RouterDefaultOptions<TContext> = Pick<
  AnyRouterDef<TContext>,
  'transformer' | 'errorFormatter'
>;

/**
 * @internal
 */
export type RouterBuildOptions<TContext> = Partial<
  Pick<AnyRouterDef<TContext>, 'procedures'>
>;

export type AnyRouter = Router<any>;

function isRouter(
  procedureOrRouter: AnyProcedure | AnyRouter,
): procedureOrRouter is AnyRouter {
  return 'router' in procedureOrRouter._def;
}

const emptyRouter = {
  _ctx: null as any,
  _errorShape: null as any,
  _meta: null as any,
  queries: {},
  mutations: {},
  subscriptions: {},
  errorFormatter: defaultFormatter,
  transformer: defaultTransformer,
};

/**
 * Reserved words that can't be used as router or procedure names
 */
const reservedWords = [
  /**
   * Then is a reserved word because otherwise we can't return a promise that returns a Proxy
   * since JS will think that `.then` is something that exists
   */
  'then',
];

/**
 *
 * @internal
 */
export function createRouterFactory<TConfig extends RootConfig>(
  defaults?: RouterDefaultOptions<TConfig['ctx']>,
) {
  return function createRouterInner<
    TProcRouterRecord extends ProcedureRouterRecord,
  >(
    opts: TProcRouterRecord,
  ): Router<
    RouterDef<
      TConfig['ctx'],
      TConfig['errorShape'],
      TConfig['meta'],
      TProcRouterRecord
    >
  > &
    TProcRouterRecord {
    const reservedWordsUsed = new Set(
      Object.keys(opts).filter((v) => reservedWords.includes(v)),
    );
    if (reservedWordsUsed.size > 0) {
      throw new Error(
        'Reserved words used in `router({})` call: ' +
          Array.from(reservedWordsUsed).join(', '),
      );
    }

    const routerProcedures: ProcedureRecord = omitPrototype({});
    function recursiveGetPaths(procedures: ProcedureRouterRecord, path = '') {
      for (const [key, procedureOrRouter] of Object.entries(procedures ?? {})) {
        const newPath = `${path}${key}`;

        if (isRouter(procedureOrRouter)) {
          recursiveGetPaths(procedureOrRouter._def.procedures, `${newPath}.`);
          continue;
        }

        routerProcedures[newPath] = procedureOrRouter;
      }
    }

    recursiveGetPaths(opts);

    const result = mergeWithoutOverrides<
      RouterDefaultOptions<TConfig['ctx']> & RouterBuildOptions<TConfig['ctx']>
    >(
      {
        transformer: defaults?.transformer ?? defaultTransformer,
        errorFormatter: defaults?.errorFormatter ?? defaultFormatter,
      },
      { procedures: routerProcedures },
    );

    const _def: AnyRouterDef<TConfig['ctx']> = {
      router: true,
      procedures: {},
      ...emptyRouter,
      ...result,
      record: opts,
      queries: Object.entries(result.procedures || {})
        .filter((pair) => (pair[1] as any)._def.query)
        .reduce((acc, [key, val]) => ({ ...acc, [key]: val }), {}),
      mutations: Object.entries(result.procedures || {})
        .filter((pair) => (pair[1] as any)._def.mutation)
        .reduce((acc, [key, val]) => ({ ...acc, [key]: val }), {}),
      subscriptions: Object.entries(result.procedures || {})
        .filter((pair) => (pair[1] as any)._def.subscription)
        .reduce((acc, [key, val]) => ({ ...acc, [key]: val }), {}),
    };

    const router: AnyRouter = {
      ...opts,
      _def,
      transformer: _def.transformer,
      errorFormatter: _def.errorFormatter,
      createCaller(ctx) {
        const proxy = createRecursiveProxy(({ path, args }) => {
          // interop mode
          if (
            path.length === 1 &&
            procedureTypes.includes(path[0] as ProcedureType)
          ) {
            return callProcedure({
              procedures: _def.procedures,
              path: args[0] as string,
              rawInput: args[1],
              ctx,
              type: path[0] as ProcedureType,
            });
          }

          const fullPath = path.join('.');
          const procedure = _def.procedures[fullPath] as AnyProcedure;

          let type: ProcedureType = 'query';
          if (procedure._def.mutation) {
            type = 'mutation';
          } else if (procedure._def.subscription) {
            type = 'subscription';
          }

          return procedure({
            path: fullPath,
            rawInput: args[0],
            ctx,
            type,
          });
        });

        return proxy as ReturnType<RouterCaller<any>>;
      },
      getErrorShape(opts) {
        const { path, error } = opts;
        const { code } = opts.error;
        const shape: DefaultErrorShape = {
          message: error.message,
          code: TRPC_ERROR_CODES_BY_KEY[code],
          data: {
            code,
            httpStatus: getHTTPStatusCodeFromError(error),
          },
        };
        if (
          process.env.NODE_ENV !== 'production' &&
          typeof opts.error.stack === 'string'
        ) {
          shape.data.stack = opts.error.stack;
        }
        if (typeof path === 'string') {
          shape.data.path = path;
        }
        return this._def.errorFormatter({ ...opts, shape });
      },
    };
    return router as any;
  };
}

/**
 * @internal
 */
export function callProcedure(
  opts: ProcedureCallOptions & { procedures: ProcedureRouterRecord },
) {
  const { type, path } = opts;

  if (!(path in opts.procedures) || !opts.procedures[path]?._def[type]) {
    throw new TRPCError({
      code: 'NOT_FOUND',
      message: `No "${type}"-procedure on path "${path}"`,
    });
  }

  const procedure = opts.procedures[path] as AnyProcedure;

  return procedure(opts);
}
