/* eslint-disable @typescript-eslint/ban-types */
import { ErrorFormatter } from '../error/formatter';
import { CombinedDataTransformer } from '../transformer';
import { mergeWithoutOverrides } from './internals/mergeWithoutOverrides';
import { Overwrite, PickFirstDefined, ValidateShape } from './internals/utils';
import { Procedure } from './procedure';

// FIXME this should properly use TContext
type ProcedureRecord<_TContext> = Record<string, Procedure<any>>;

/**
 * This only exists b/c of interop mode
 * @deprecated
 * @internal
 */
interface RouterDef<TContext> {
  queries: ProcedureRecord<TContext>;
  mutations: ProcedureRecord<TContext>;
  subscriptions: ProcedureRecord<TContext>;
  errorFormatter: ErrorFormatter<TContext, any>;
  transformer: CombinedDataTransformer;
}

export interface Router<TContext> extends RouterDef<TContext> {
  /**
   * @deprecated Deprecated since v10
   */
  _def: RouterDef<TContext>;
}

/**
 * @internal
 */
export type RouterOptions<TContext> = Partial<Router<TContext>>;

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
  ): Overwrite<Router<TContext>, Overwrite<TDefaults, TProcedures>> {
    const result = mergeWithoutOverrides<
      RouterDefaultOptions<TContext> & RouterBuildOptions<TContext>
    >(defaults || {}, procedures);

    const _def: RouterDef<TContext> = {
      queries: {},
      mutations: {},
      subscriptions: {},
      errorFormatter: result.errorFormatter || defaultErrorFormatter,
      transformer: result.transformer || defaultTransformer,
      ...result,
    };
    const router: Router<TContext> = {
      _def,
      ..._def,
    };
    return router as any;
  };
}

type EnsureRecord<T> = undefined extends T ? {} : T;

type mergeRouters<
  TContext,
  A extends RouterOptions<TContext>,
  B extends RouterOptions<TContext>,
> = {
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
type mergeRoutersVariadic<Routers extends RouterOptions<any>[]> =
  Routers extends []
    ? {}
    : Routers extends [infer First, ...infer Rest]
    ? First extends RouterOptions<any>
      ? Rest extends RouterOptions<any>[]
        ? mergeRouters<any, First, mergeRoutersVariadic<Rest>>
        : never
      : never
    : never;

export function mergeRouters<TRouters extends RouterOptions<any>[]>(
  ..._routers: TRouters
): mergeRoutersVariadic<TRouters> {
  throw new Error('Unimplemnted');
}
