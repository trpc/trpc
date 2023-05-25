import { TRPCError } from '../error/TRPCError';
import { DefaultErrorShape, defaultFormatter } from '../error/formatter';
import { getHTTPStatusCodeFromError } from '../http/getHTTPStatusCode';
import { TRPC_ERROR_CODES_BY_KEY } from '../rpc';
import { createRecursiveProxy } from '../shared/createProxy';
import { defaultTransformer } from '../transformer';
import { AnyRootConfig } from './internals/config';
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

export interface ProcedureRouterRecord {
  [key: string]: AnyProcedure | AnyRouter;
}

/**
 * @deprecated
 */
interface DeprecatedProcedureRouterRecord {
  queries: Record<string, AnyQueryProcedure>;
  mutations: Record<string, AnyMutationProcedure>;
  subscriptions: Record<string, AnySubscriptionProcedure>;
}

export interface RouterDef<
  TConfig extends AnyRootConfig,
  TRecord extends ProcedureRouterRecord,
  /**
   * @deprecated
   */
  TOld extends DeprecatedProcedureRouterRecord = {
    // eslint-disable-next-line @typescript-eslint/ban-types
    queries: {};
    // eslint-disable-next-line @typescript-eslint/ban-types
    mutations: {};
    // eslint-disable-next-line @typescript-eslint/ban-types
    subscriptions: {};
  },
> {
  _config: TConfig;
  router: true;
  procedures: TRecord;
  record: TRecord;
  /**
   * V9 queries
   * @deprecated
   */
  queries: TOld['queries'];
  /**
   * V9 mutations
   * @deprecated
   */
  mutations: TOld['mutations'];
  /**
   * V9 subscriptions
   * @deprecated
   */
  subscriptions: TOld['subscriptions'];
}

export type AnyRouterDef<
  TConfig extends AnyRootConfig = AnyRootConfig,
  TOld extends DeprecatedProcedureRouterRecord = any,
> = RouterDef<TConfig, any, TOld>;

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
type RouterCaller<TDef extends AnyRouterDef> = (
  ctx: TDef['_config']['$types']['ctx'],
) => {
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
  createCaller: RouterCaller<TDef>;

  /**
   * @deprecated
   * FIXME: use the new standalone `getErrorShape` instead
   */
  getErrorShape(opts: {
    error: TRPCError;
    type: ProcedureType | 'unknown';
    path: string | undefined;
    input: unknown;
    ctx: undefined | TDef['_config']['$types']['ctx'];
  }): TDef['_config']['$types']['errorShape'];
}

export type AnyRouter = Router<AnyRouterDef>;

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
 * @internal
 */
export type CreateRouterInner<
  TConfig extends AnyRootConfig,
  TProcRouterRecord extends ProcedureRouterRecord,
> = Router<RouterDef<TConfig, TProcRouterRecord>> &
  /**
   * This should be deleted in v11
   * @deprecated
   */ TProcRouterRecord;

/**
 * @internal
 */
export function createRouterFactory<TConfig extends AnyRootConfig>(
  config: TConfig,
) {
  return function createRouterInner<
    TProcRouterRecord extends ProcedureRouterRecord,
  >(
    procedures: TProcRouterRecord,
  ): CreateRouterInner<TConfig, TProcRouterRecord> {
    const reservedWordsUsed = new Set(
      Object.keys(procedures).filter((v) => reservedWords.includes(v)),
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

        if (routerProcedures[newPath]) {
          throw new Error(`Duplicate key: ${newPath}`);
        }

        routerProcedures[newPath] = procedureOrRouter;
      }
    }
    recursiveGetPaths(procedures);

    const _def: AnyRouterDef<TConfig> = {
      _config: config,
      router: true,
      procedures: routerProcedures,
      ...emptyRouter,
      record: procedures,
      queries: Object.entries(routerProcedures)
        .filter((pair) => (pair[1] as any)._def.query)
        .reduce((acc, [key, val]) => ({ ...acc, [key]: val }), {}),
      mutations: Object.entries(routerProcedures)
        .filter((pair) => (pair[1] as any)._def.mutation)
        .reduce((acc, [key, val]) => ({ ...acc, [key]: val }), {}),
      subscriptions: Object.entries(routerProcedures)
        .filter((pair) => (pair[1] as any)._def.subscription)
        .reduce((acc, [key, val]) => ({ ...acc, [key]: val }), {}),
    };

    const router: AnyRouter = {
      ...procedures,
      _def,
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
        if (config.isDev && typeof opts.error.stack === 'string') {
          shape.data.stack = opts.error.stack;
        }
        if (typeof path === 'string') {
          shape.data.path = path;
        }
        return this._def._config.errorFormatter({ ...opts, shape });
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
