/* eslint-disable @typescript-eslint/ban-types */
import { inferProcedureOutput } from '.';
import { Filter } from '..';
import { TRPCError } from '../error/TRPCError';
import {
  DefaultErrorShape,
  ErrorFormatter,
  defaultFormatter,
} from '../error/formatter';
import { getHTTPStatusCodeFromError } from '../http/internals/getHTTPStatusCode';
import { TRPCErrorShape, TRPC_ERROR_CODES_BY_KEY } from '../rpc';
import { CombinedDataTransformer, defaultTransformer } from '../transformer';
import { RootConfig } from './internals/config';
import {
  InternalProcedure,
  InternalProcedureCallOptions,
} from './internals/internalProcedure';
import { mergeWithoutOverrides } from './internals/mergeWithoutOverrides';
import { omitPrototype } from './internals/omitPrototype';
import { EnsureRecord, ValidateShape } from './internals/utils';
import {
  MutationProcedure,
  Procedure,
  QueryProcedure,
  SubscriptionProcedure,
} from './procedure';
import { ProcedureType } from './types';

export type RecursiveRecord<T> = {
  [key: string]: T | RecursiveRecord<T>;
};

export type RecursiveProcedureRecord = RecursiveRecord<Procedure<any>>;

export interface ProcedureStructure {
  queries: RecursiveRecord<QueryProcedure<any>>;
  mutations: RecursiveRecord<MutationProcedure<any>>;
  subscriptions: RecursiveRecord<SubscriptionProcedure<any>>;
  procedures: RecursiveProcedureRecord;
}

export interface RouterDef<
  // FIXME this should use RootConfig
  TContext,
  TErrorShape extends TRPCErrorShape<number>,
  TMeta extends Record<string, unknown>,
  TProcedures extends RecursiveRecord<Procedure<any>>,
> {
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
  procedures: TProcedures;
  // FIXME decide if these are deprecated
  /**
   * @deprecated
   */
  subscriptions: Filter<TProcedures, SubscriptionProcedure<any>>;
  /**
   * @deprecated
   */
  queries: Filter<TProcedures, QueryProcedure<any>>;
  /**
   * @deprecated
   */
  mutations: Filter<TProcedures, MutationProcedure<any>>;
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
) => inferProcedureOutput<TProcedure>;

/**
 * This only exists b/c of interop mode
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
};

export interface Router<TDef extends AnyRouterDef> {
  _def: RouterDef<
    TDef['_ctx'],
    TDef['_errorShape'],
    TDef['_meta'],
    TDef['procedures']
  >;
  /** @deprecated **/
  errorFormatter: TDef['errorFormatter'];
  /** @deprecated **/
  transformer: TDef['transformer'];

  // FIXME rename me and deprecate
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

function createRouterProxy(callback: (...args: [string, ...unknown[]]) => any) {
  return new Proxy({} as any, {
    get(_, path: string) {
      return (...args: unknown[]) => callback(path, ...args);
    },
  });
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
    TProcedures extends RouterBuildOptions<TConfig>,
  >(
    opts: ValidateShape<TProcedures, RouterBuildOptions<TConfig>>,
  ): Router<
    RouterDef<
      TConfig['ctx'],
      TConfig['errorShape'],
      TConfig['meta'],
      EnsureRecord<TProcedures['procedures']>
    >
  > {
    const routerProcedures: Record<string, Procedure<any>> = omitPrototype({});
    function recursiveGetPaths(procedures: Record<string, any>, path = '') {
      for (const [key, procedureOrObject] of Object.entries(procedures ?? {})) {
        const newPath = `${path}${key}`;

        if (typeof procedureOrObject === 'object') {
          recursiveGetPaths(procedureOrObject, `${newPath}.`);
          continue;
        }

        routerProcedures[newPath] = procedureOrObject;
      }
    }

    recursiveGetPaths(opts.procedures);

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
      procedures: {},
      ...emptyRouter,
      ...result,
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
    const def = {
      _def,
      transformer: _def.transformer,
      errorFormatter: _def.errorFormatter,
    };

    function callProcedure(opts: InternalProcedureCallOptions) {
      const { type, path } = opts;

      if (!(path in _def.procedures) || !_def.procedures[path]['_def'][type]) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: `No "${type}"-procedure on path "${path}"`,
        });
      }

      const procedure = _def.procedures[path] as InternalProcedure;

      return procedure(opts);
    }
    const router: AnyRouter = {
      ...def,
      createCaller(ctx) {
        return {
          query: (path, ...args) =>
            callProcedure({
              path,
              rawInput: args[0],
              ctx,
              type: 'query',
            }) as any,
          mutation: (path, ...args) =>
            callProcedure({
              path,
              rawInput: args[0],
              ctx,
              type: 'mutation',
            }) as any,
          subscription: (path, ...args) =>
            callProcedure({
              path,
              rawInput: args[0],
              ctx,
              type: 'subscription',
            }) as any,

          queries: createRouterProxy((path, rawInput) =>
            callProcedure({
              path,
              rawInput,
              ctx,
              type: 'query',
            }),
          ),
          mutations: createRouterProxy((path, rawInput) =>
            callProcedure({
              path,
              rawInput,
              ctx,
              type: 'mutation',
            }),
          ),
          subscriptions: createRouterProxy((path, rawInput) =>
            callProcedure({
              path,
              rawInput,
              ctx,
              type: 'subscription',
            }),
          ),
        };
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
