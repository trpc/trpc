/* eslint-disable @typescript-eslint/ban-types */
import { ErrorFormatter } from '../error/formatter';
import { CombinedDataTransformer } from '../transformer';
import { mergeWithoutOverrides } from './internals/mergeWithoutOverrides';
import { PickFirstDefined, ValidateShape } from './internals/utils';
import { Procedure } from './procedure';

// FIXME this should properly use TContext
type ProcedureRecord<_TContext> = Record<string, Procedure<any>>;

export interface Router<TContext> {
  queries: ProcedureRecord<TContext>;
  mutations: ProcedureRecord<TContext>;
  subscriptions: ProcedureRecord<TContext>;
  errorFormatter: ErrorFormatter<TContext, any>;
  transformer: CombinedDataTransformer;
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
  return function createRouter<
    TProcedures extends RouterBuildOptions<TContext>,
  >(
    procedures: ValidateShape<TProcedures, RouterBuildOptions<TContext>>,
  ): TProcedures {
    const result = mergeWithoutOverrides<
      RouterDefaultOptions<TContext> & RouterBuildOptions<TContext>
    >(defaults || {}, procedures);

    return {
      queries: {},
      mutations: {},
      subscriptions: {},
      errorFormatter: result.errorFormatter || defaultErrorFormatter,
      transformer: result.transformer || defaultTransformer,
      ...result,
      // FIXME no any typecast here
    } as any;
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
  errorFormatter: PickFirstDefined<A['errorFormatter'], B['errorFormatter']>;
  transformer: PickFirstDefined<A['transformer'], B['transformer']>;
};

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
