/* eslint-disable @typescript-eslint/ban-types */
import { ErrorFormatter } from '../error/formatter';
import { TRPCErrorShape } from '../rpc';
import { CombinedDataTransformer } from '../transformer';
import { mergeWithoutOverrides } from './internals/mergeWithoutOverrides';
import { Overwrite, PickFirstDefined, ValidateShape } from './internals/utils';
import { Procedure } from './procedure';

// FIXME this should properly use TContext
type ProcedureRecord<_TContext> = Record<string, Procedure<any>>;

interface RouterParams<
  TContext,
  TErrorShape extends TRPCErrorShape<number>,
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
  queries: TQueries;
  mutations: TMutations;
  subscriptions: TSubscriptions;
  errorFormatter: ErrorFormatter<TContext, TErrorShape>;
  transformer: CombinedDataTransformer;
}

type AnyRouterParams<TContext = any> = RouterParams<
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
  /**
   * @deprecated Deprecated since v10
   */
  _def: RouterParams<
    TParams['_ctx'],
    TParams['_errorShape'],
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
}

/**
 * @internal
 */
export type RouterOptions<TContext> = Partial<AnyRouterParams<TContext>>;

/**
 * @internal
 */
export type RouterDefaultOptions<TContext> = Pick<
  RouterOptions<TContext>,
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

const defaultTransformer: CombinedDataTransformer = {
  input: { serialize: (obj) => obj, deserialize: (obj) => obj },
  output: { serialize: (obj) => obj, deserialize: (obj) => obj },
};

const defaultErrorFormatter: ErrorFormatter<any, any> = ({ shape }) => {
  return shape;
};

const emptyRouter = {
  _ctx: null as any,
  _errorShape: null as any,
  queries: {},
  mutations: {},
  subscriptions: {},
  errorFormatter: defaultErrorFormatter,
  transformer: defaultTransformer,
};
// type EmptyRouter = typeof emptyRouter;

/**
 *
 * @internal
 */
export function createRouterWithContext<TContext>(
  defaults?: RouterDefaultOptions<TContext>,
) {
  type TDefaults = RouterDefaultOptions<TContext>;
  return function createRouter<
    TProcedures extends RouterBuildOptions<TContext>,
  >(
    procedures: ValidateShape<TProcedures, RouterBuildOptions<TContext>>,
  ): Overwrite<AnyRouter, Overwrite<TDefaults, TProcedures>> {
    const result = mergeWithoutOverrides<
      RouterDefaultOptions<TContext> & RouterBuildOptions<TContext>
    >(defaults || {}, procedures);

    const _def: AnyRouterParams<TContext> = {
      ...emptyRouter,
      errorFormatter: result.errorFormatter || emptyRouter.errorFormatter,
      transformer: result.transformer || emptyRouter.transformer,
      ...result,
    };
    const router: AnyRouter = {
      _def,
      ..._def,
      createCaller: () => {
        throw new Error('Unimpl');
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
  queries: EnsureRecord<A['queries']> & EnsureRecord<B['queries']>;
  mutations: EnsureRecord<A['mutations']> & EnsureRecord<B['mutations']>;
  subscriptions: EnsureRecord<A['subscriptions']> &
    EnsureRecord<B['subscriptions']>;
  errorFormatter: PickFirstDefined<B['errorFormatter'], A['errorFormatter']>;
  transformer: PickFirstDefined<B['transformer'], A['transformer']>;
  createCaller: A['createCaller'];
};

type mergeRoutersVariadic<Routers extends Partial<AnyRouter>[]> =
  Routers extends []
    ? {}
    : Routers extends [infer First, ...infer Rest]
    ? First extends Partial<AnyRouter>
      ? Rest extends Partial<AnyRouter>[]
        ? mergeRouters<First, mergeRoutersVariadic<Rest>>
        : never
      : never
    : never;

export function mergeRouters<TRouters extends RouterOptions<any>[]>(
  ..._routers: TRouters
): mergeRoutersVariadic<TRouters> {
  throw new Error('Unimplemnted');
}
