/* eslint-disable @typescript-eslint/ban-types */
import { TRPCError } from '../TRPCError';
import {
  DefaultErrorShape,
  ErrorFormatter,
  ErrorFormatterShape,
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
import { PickFirstDefined, ValidateShape } from './internals/utils';
import { Procedure } from './procedure';
import { ProcedureType } from './types';

// FIXME this should properly use TContext maybe?
export type ProcedureRecord<_TContext> = Record<string, Procedure<any>>;

export interface RouterParams<
  TContext,
  TErrorShape extends TRPCErrorShape<number>,
  TMeta extends Record<string, unknown>,
  TQueries extends ProcedureRecord<TContext>,
  TMutations extends ProcedureRecord<TContext>,
  TSubscriptions extends ProcedureRecord<TContext>,
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
  queries: TQueries;
  mutations: TMutations;
  subscriptions: TSubscriptions;
  errorFormatter: ErrorFormatter<TContext, TErrorShape>;
  transformer: CombinedDataTransformer;
}

export type AnyRouterParams<TContext = any> = RouterParams<
  TContext,
  any,
  any,
  any,
  any,
  any
>;

/**
 * @internal
 */
export type inferHandlerInput<TProcedure extends Procedure<any>> =
  TProcedure extends Procedure<infer TParams>
    ? undefined extends TParams['_input_in'] // ? is input optional
      ? unknown extends TParams['_input_in'] // ? is input unset
        ? [(null | undefined)?] // -> there is no input
        : [(TParams['_input_in'] | null | undefined)?] // -> there is optional input
      : [TParams['_input_in']] // -> input is required
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
) => ReturnType<TProcedure>;

/**
 * This only exists b/c of interop mode
 * @internal
 */

type RouterCaller<TParams extends AnyRouterParams> = (ctx: TParams['_ctx']) => {
  query: inferHandlerFn<TParams['queries']>;
  mutation: inferHandlerFn<TParams['mutations']>;
  subscription: inferHandlerFn<TParams['subscriptions']>;
};

export interface Router<TParams extends AnyRouterParams> {
  _def: RouterParams<
    TParams['_ctx'],
    TParams['_errorShape'],
    TParams['_meta'],
    TParams['queries'],
    TParams['mutations'],
    TParams['subscriptions']
  >;
  queries: TParams['queries'];
  mutations: TParams['mutations'];
  subscriptions: TParams['subscriptions'];
  errorFormatter: TParams['errorFormatter'];
  transformer: TParams['transformer'];

  createCaller: RouterCaller<TParams>;
  getErrorShape(opts: {
    error: TRPCError;
    type: ProcedureType | 'unknown';
    path: string | undefined;
    input: unknown;
    ctx: undefined | TParams['_ctx'];
  }): TParams['_errorShape'];
}

/**
 * @internal
 */
export type RouterOptions<TContext> = Partial<AnyRouterParams<TContext>>;

/**
 * @internal
 */
export type RouterDefaultOptions<TContext> = Pick<
  AnyRouterParams<TContext>,
  'transformer' | 'errorFormatter'
>;

/**
 * @internal
 */
type RouterBuildOptions<TContext> = Pick<
  RouterOptions<TContext>,
  'queries' | 'subscriptions' | 'mutations'
>;

export type AnyRouter = Router<any>;

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
// type EmptyRouter = typeof emptyRouter;

const PROCEDURE_DEFINITION_MAP: Record<
  ProcedureType,
  'queries' | 'mutations' | 'subscriptions'
> = {
  query: 'queries',
  mutation: 'mutations',
  subscription: 'subscriptions',
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
    procedures: ValidateShape<
      TProcedures,
      RouterBuildOptions<TSettings['ctx']>
    >,
  ): Router<{
    _ctx: TSettings['ctx'];
    _errorShape: TSettings['errorShape'];
    _meta: TSettings['meta'];
    queries: TProcedures['queries'];
    mutations: TProcedures['mutations'];
    subscriptions: TProcedures['subscriptions'];
    errorFormatter: ErrorFormatter<TSettings['ctx'], TSettings['errorShape']>;
    transformer: TSettings['transformer'];
  }> {
    const result = mergeWithoutOverrides<
      RouterDefaultOptions<TSettings['ctx']> &
        RouterBuildOptions<TSettings['ctx']>
    >(
      {
        transformer: defaults?.transformer ?? defaultTransformer,
        errorFormatter: defaults?.errorFormatter ?? defaultFormatter,
      },
      {
        queries: omitPrototype(procedures.queries),
        mutations: omitPrototype(procedures.mutations),
        subscriptions: omitPrototype(procedures.subscriptions),
      },
    );

    const _def: AnyRouterParams<TSettings['ctx']> = {
      ...emptyRouter,
      ...result,
    };
    const def = {
      _def,
      ..._def,
    };

    function callProcedure(opts: InternalProcedureCallOptions) {
      const { type, path } = opts;
      const defTarget = PROCEDURE_DEFINITION_MAP[type];
      const defs = def[defTarget];

      if (!(path in defs)) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: `No "${type}"-procedure on path "${path}"`,
        });
      }
      const procedure = defs[path] as InternalProcedure;
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

type EnsureRecord<T> = undefined extends T ? {} : T;

type mergeRouters<
  A extends Partial<AnyRouter>,
  B extends Partial<AnyRouter>,
> = {
  _ctx: NonNullable<A['_def']>['_ctx'];
  _meta: NonNullable<A['_def']>['_meta'];
  queries: EnsureRecord<A['queries']> & EnsureRecord<B['queries']>;
  mutations: EnsureRecord<A['mutations']> & EnsureRecord<B['mutations']>;
  subscriptions: EnsureRecord<A['subscriptions']> &
    EnsureRecord<B['subscriptions']>;
  errorFormatter: PickFirstDefined<B['errorFormatter'], A['errorFormatter']>;
  transformer: PickFirstDefined<B['transformer'], A['transformer']>;
};

/**
 * @internal
 */
export type mergeRoutersVariadic<Routers extends Partial<AnyRouter>[]> =
  Routers extends []
    ? {}
    : Routers extends [infer First, ...infer Rest]
    ? First extends Partial<AnyRouter>
      ? Rest extends Partial<AnyRouter>[]
        ? mergeRouters<First, mergeRoutersVariadic<Rest>>
        : never
      : never
    : never;

/**
 * @internal
 */
export function mergeRoutersFactory<TSettings extends RootConfig>() {
  return function mergeRouters<TRouterItems extends RouterOptions<any>[]>(
    ...routerList: TRouterItems
  ) {
    type TMergedRouters = mergeRoutersVariadic<TRouterItems>;
    type TRouterParams = TMergedRouters extends {
      _ctx: infer Ctx;
      _meta: infer Meta;
      queries: infer Queries;
      mutations: infer Mutations;
      subscriptions: infer Subscriptions;
      errorFormatter: infer ErrorFormatter;
    }
      ? RouterParams<
          Ctx,
          ErrorFormatterShape<ErrorFormatter>,
          Meta extends {} ? Meta : {},
          Queries extends ProcedureRecord<any> ? Queries : never,
          Mutations extends ProcedureRecord<any> ? Mutations : never,
          Subscriptions extends ProcedureRecord<any> ? Subscriptions : never
        >
      : never;

    const queries = mergeWithoutOverrides(
      {},
      ...routerList.map((r) => r.queries),
    ) as TRouterParams['queries'];
    const mutations = mergeWithoutOverrides(
      {},
      ...routerList.map((r) => r.mutations),
    );
    const subscriptions = mergeWithoutOverrides(
      {},
      ...routerList.map((r) => r.subscriptions),
    );
    const errorFormatter = routerList.reduce(
      (currentErrorFormatter, nextRouter) => {
        if (
          nextRouter.errorFormatter &&
          nextRouter.errorFormatter !== defaultFormatter
        ) {
          if (
            currentErrorFormatter !== defaultFormatter &&
            currentErrorFormatter !== nextRouter.errorFormatter
          ) {
            throw new Error('You seem to have several error formatters');
          }
          return nextRouter.errorFormatter;
        }
        return currentErrorFormatter;
      },
      defaultFormatter,
    );

    const transformer = routerList.reduce((prev, current) => {
      if (current.transformer && current.transformer !== defaultTransformer) {
        if (prev !== defaultTransformer && prev !== current.transformer) {
          throw new Error('You seem to have several transformers');
        }
        return current.transformer;
      }
      return prev;
    }, defaultTransformer as CombinedDataTransformer);

    const router = createRouterFactory<TSettings>({
      errorFormatter,
      transformer,
    })({
      queries,
      mutations,
      subscriptions,
    });

    return router as any as Router<TRouterParams>;
  };
}
