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
import { prefixObjectKeys } from './internals/prefixObjectKeys';
import { EnsureRecord, ValidateShape } from './internals/utils';
import {
  MutationProcedure,
  Procedure,
  QueryProcedure,
  SubscriptionProcedure,
} from './procedure';
import { ProcedureType } from './types';

// FIXME this should properly use TContext maybe?
export type ProcedureRecord<_TContext> = Record<string, Procedure<any>>;
type AnyProcedureRecord = ProcedureRecord<any>;
export interface ProcedureStructure {
  queries: Record<string, QueryProcedure<any>>;
  mutations: Record<string, MutationProcedure<any>>;
  subscriptions: Record<string, SubscriptionProcedure<any>>;
  procedures: AnyProcedureRecord;
}

export interface RouterDef<
  // FIXME this should use RootConfig
  TContext,
  TErrorShape extends TRPCErrorShape<number>,
  TMeta extends Record<string, unknown>,
  TChildren extends Record<string, AnyRouter>,
  TProcedures extends AnyProcedureRecord,
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
  // Maybe a better impl would be `Record<string, Partial<ProcedureStructure>>`? not sure
  children: TChildren;
  procedures: TProcedures;
  // FIXME decide if these are deprecated
  subscriptions: Filter<TProcedures, SubscriptionProcedure<any>>;
  queries: Filter<TProcedures, QueryProcedure<any>>;
  mutations: Filter<TProcedures, MutationProcedure<any>>;
}

export type AnyRouterDef<TContext = any> = RouterDef<
  TContext,
  any,
  any,
  any,
  any
>;

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
type inferHandlerFn<TProcedures extends ProcedureRecord<any>> = <
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
    TDef['children'],
    TDef['procedures']
  >;
  /** @deprecated **/
  errorFormatter: TDef['errorFormatter'];
  /** @deprecated **/
  transformer: TDef['transformer'];
  /** @deprecated **/
  children: TDef['children'];

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
export type RouterOptions<TContext> = Partial<AnyRouterDef<TContext>>;

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
export type RouterBuildOptions<TContext> = Pick<
  RouterOptions<TContext>,
  'children' | 'procedures'
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
export function createRouterFactory<TSettings extends RootConfig>(
  defaults?: RouterDefaultOptions<TSettings['ctx']>,
) {
  return function createRouterInner<
    TProcedures extends RouterBuildOptions<TSettings['ctx']>,
  >(
    opts: ValidateShape<TProcedures, RouterBuildOptions<TSettings['ctx']>>,
  ): Router<
    RouterDef<
      TSettings['ctx'],
      TSettings['errorShape'],
      TSettings['meta'],
      EnsureRecord<TProcedures['children']>,
      EnsureRecord<TProcedures['procedures']>
    >
  > {
    const prefixedChildren = Object.entries(opts.children ?? {}).map(
      ([key, childRouter]) => {
        const queries = prefixObjectKeys(
          (childRouter as any).queries,
          `${key}.`,
        );
        const mutations = prefixObjectKeys(
          (childRouter as any).mutations,
          `${key}.`,
        );
        const subscriptions = prefixObjectKeys(
          (childRouter as any).subscriptions,
          `${key}.`,
        );
        const procedures = prefixObjectKeys(
          (childRouter as any).procedures,
          `${key}.`,
        );

        return {
          queries,
          mutations,
          subscriptions,
          procedures,
        };
      },
    );
    const routerProcedures = {
      procedures: mergeWithoutOverrides(
        opts.procedures,
        ...prefixedChildren.map((child) => child.procedures),
      ),

      children: opts.children || {},
    };

    const result = mergeWithoutOverrides<
      RouterDefaultOptions<TSettings['ctx']> &
        RouterBuildOptions<TSettings['ctx']>
    >(
      {
        transformer: defaults?.transformer ?? defaultTransformer,
        errorFormatter: defaults?.errorFormatter ?? defaultFormatter,
      },
      routerProcedures,
    );

    const _def: AnyRouterDef<TSettings['ctx']> = {
      children: {},
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
      ..._def,
    };

    function callProcedure(opts: InternalProcedureCallOptions) {
      const { type, path } = opts;

      if (!(path in def.procedures)) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: `No "${type}"-procedure on path "${path}"`,
        });
      }

      const procedure = def.procedures[path] as InternalProcedure;
      return procedure(opts);
    }
    const router: AnyRouter = {
      ...def,
      children: opts.children,
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
