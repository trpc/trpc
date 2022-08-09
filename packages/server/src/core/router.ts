/* eslint-disable @typescript-eslint/ban-types */
import { inferProcedureOutput } from '.';
import { Filter, Prefixer } from '..';
import { TRPCError } from '../error/TRPCError';
import {
  DefaultErrorShape,
  ErrorFormatter,
  defaultFormatter,
} from '../error/formatter';
import { getHTTPStatusCodeFromError } from '../http/internals/getHTTPStatusCode';
import { TRPCErrorShape, TRPC_ERROR_CODES_BY_KEY } from '../rpc';
import { createProxy } from '../shared';
import { CombinedDataTransformer, defaultTransformer } from '../transformer';
import { RootConfig } from './internals/config';
import { mergeWithoutOverrides } from './internals/mergeWithoutOverrides';
import { omitPrototype } from './internals/omitPrototype';
import { ProcedureCallOptions } from './internals/procedureBuilder';
import {
  AnyProcedure,
  MutationProcedure,
  Procedure,
  ProcedureArgs,
  QueryProcedure,
  SubscriptionProcedure,
} from './procedure';
import { ProcedureType, procedureTypes } from './types';

type ProcedureRecord = Record<string, Procedure<any>>;

export type ProcedureRouterRecord = Record<string, Procedure<any> | AnyRouter>;

export interface ProcedureStructure {
  queries: Record<string, QueryProcedure<any>>;
  mutations: Record<string, MutationProcedure<any>>;
  subscriptions: Record<string, SubscriptionProcedure<any>>;
  procedures: ProcedureRecord;
}

type ObjKeyof<T> = T extends object ? keyof T : never;
type KeyofKeyof<T> = ObjKeyof<T> | { [K in keyof T]: ObjKeyof<T[K]> }[keyof T];
type StripNever<T> = Pick<
  T,
  { [K in keyof T]: [T[K]] extends [never] ? never : K }[keyof T]
>;
type Lookup<T, K> = T extends any ? (K extends keyof T ? T[K] : never) : never;
type SimpleFlatten<T> = T extends object
  ? StripNever<{
      [K in KeyofKeyof<T>]:
        | Exclude<K extends keyof T ? T[K] : never, object>
        | { [P in keyof T]: Lookup<T[P], K> }[keyof T];
    }>
  : T;

type PrefixedProcedures<T extends ProcedureRouterRecord> = {
  [K in keyof T]: T[K] extends AnyRouter
    ? T[K] extends Procedure<any>
      ? never
      : Prefixer<T[K]['_def']['procedures'], `${K & string}.`>
    : never;
};
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
  // FIXME this is slow:
  // - I think this has to go & be replaced by something by only using `TRecord` without `& SimpleFlatten...`
  // - Potentially, we have a `legacyProcedures` record where we only register the old things that are availble by string path
  procedures: Filter<TRecord, Procedure<any>> &
    SimpleFlatten<PrefixedProcedures<TRecord>>;
  routers: Filter<TRecord, Router<any>>;
  record: TRecord;
  // FIXME this is slow
  subscriptions: Filter<TRecord, SubscriptionProcedure<any> & { _old: true }> &
    Filter<
      SimpleFlatten<PrefixedProcedures<TRecord>>,
      SubscriptionProcedure<any> & { _old: true }
    >;
  queries: Filter<TRecord, QueryProcedure<any> & { _old: true }> &
    Filter<
      SimpleFlatten<PrefixedProcedures<TRecord>>,
      QueryProcedure<any> & { _old: true }
    >;
  mutations: Filter<TRecord, MutationProcedure<any> & { _old: true }> &
    Filter<
      SimpleFlatten<PrefixedProcedures<TRecord>>,
      MutationProcedure<any> & { _old: true }
    >;
}

export type AnyRouterDef<TContext = any> = RouterDef<TContext, any, any, any>;

/**
 * @internal
 */
export type inferHandlerInput<TProcedure extends Procedure<any>> =
  TProcedure extends Procedure<infer TDef>
    ? undefined extends TDef['_input_in'] // ? is input optional
      ? unknown extends TDef['_input_in'] // ? is input unset
        ? [(null | undefined)?] // -> there is no input
        : [(TDef['_input_in'] | null | undefined)?] // -> there is optional input
      : [TDef['_input_in']] // -> input is required
    : [(undefined | null)?]; // -> there is no input

/**
 * @internal
 */
type inferHandlerFn<TProcedures extends Record<string, Procedure<any>>> = <
  TProcedure extends TProcedures[TPath],
  TPath extends keyof TProcedures & string,
>(
  path: TPath,
  ...args: inferHandlerInput<TProcedure>
) => Promise<inferProcedureOutput<TProcedure>>;

type DecorateProcedure<TProcedure extends Procedure<any>> = (
  input: ProcedureArgs<TProcedure['_def']>[0],
) => Promise<TProcedure['_def']['_output_out']>;

type assertProcedure<T> = T extends Procedure<any> ? T : never;

/**
 * @internal
 */
type DecoratedProcedureRecord<TProcedures extends ProcedureRouterRecord> = {
  [TKey in keyof TProcedures]: TProcedures[TKey] extends AnyRouter
    ? DecoratedProcedureRecord<TProcedures[TKey]['_def']['record']>
    : DecorateProcedure<assertProcedure<TProcedures[TKey]>>;
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
  _def: RouterDef<
    TDef['_ctx'],
    TDef['_errorShape'],
    TDef['_meta'],
    TDef['record']
  >;
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
    const routerProcedures: Record<string, Procedure<any>> = omitPrototype({});
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
      routers: Object.entries(result.procedures || {})
        .filter((pair) => (pair[1] as any)._def._router)
        .reduce((acc, [key, val]) => ({ ...acc, [key]: val }), {}),
    };

    const router: AnyRouter = {
      ...opts,
      _def,
      transformer: _def.transformer,
      errorFormatter: _def.errorFormatter,
      createCaller(ctx) {
        const proxy = createProxy(({ path, args }) => {
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
