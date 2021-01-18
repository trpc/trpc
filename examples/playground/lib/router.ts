import { assertNotBrowser } from './assertNotBrowser';
import { Prefixer, DropFirst } from './types';
assertNotBrowser();

export type RouterResolverFn<TContext, TData, TArgs extends any[]> = (
  ctx: TContext,
  ...args: TArgs
) => Promise<TData> | TData;


export type RouterEndpoints<TContext extends {}> = Record<
  string,
  RouterResolverFn<TContext, any, any>
>;

function prefixEndpoints<
  TEndpoints extends RouterEndpoints<any>,
  TPrefix extends string
>(
  endpoints: TEndpoints,
  prefix: TPrefix,
): TEndpoints & Prefixer<TEndpoints, TPrefix> {
  return Object.keys(endpoints).reduce((eps, key) => {
    const newKey = `${prefix}${key}`.toLowerCase()
    eps[newKey] = endpoints[key];
    return eps;
  }, {} as RouterEndpoints<any>) as any;
}

export class Router<
  TContext extends {} = {},
  TQueries extends RouterEndpoints<TContext> = {},
  TMutations extends RouterEndpoints<TContext> = {},
  > {
  readonly _queries: TQueries;
  readonly _mutations: TMutations;

  constructor(opts: {queries?: TQueries, mutations?: TMutations} = {}) {
    this._queries = opts.queries ?? {} as TQueries;
    this._mutations = opts.mutations ?? {} as TMutations;
  }

  /**
   * Add new queries and return router
   * @param queries 
   */
  public queries<TNewEndpoints extends RouterEndpoints<TContext>>(
    endpoints: TNewEndpoints,
  ): Router<TContext, TQueries & TNewEndpoints, TMutations> {
    const router = new Router<TContext, TNewEndpoints>({ queries: endpoints })
    return this.merge(router)
  }

  /**
   * Add new queries and return router
   * @param queries 
   */
  public mutations<TNewEndpoints extends RouterEndpoints<TContext>>(
    endpoints: TNewEndpoints,
  ): Router<TContext, TQueries, TMutations & TNewEndpoints> {
    const router = new Router<TContext, {}, TNewEndpoints>({ mutations: endpoints });

    return this.merge(router)
  }

  /**
   * Merge router with other router
   * @param router
   */
  public merge<
    TChildRouter extends Router<TContext, any, any>
  >(
    router: TChildRouter
  ): Router<
      TContext, 
      TQueries & TChildRouter['_queries'], 
      TMutations & TChildRouter['_mutations']
    >;

  /**
   * Merge router with other router
   * @param prefix Prefix that this router should live under
   * @param router
   */
  public merge<
    TPath extends string,
    TChildRouter extends Router<TContext, any, any>
  >(
    prefix: TPath,
    router: TChildRouter
  ): Router<
      TContext, 
      TQueries & Prefixer<TChildRouter['_queries'], `${TPath}`>, 
      TMutations & Prefixer<TChildRouter['_mutations'], `${TPath}`>
    >;

  public merge(prefixOrRouter: unknown, maybeRouter?: unknown) {
    let prefix = ''
    let router: Router<any, any>;
    
    if (typeof prefixOrRouter === 'string' && maybeRouter instanceof Router) {
      prefix = prefixOrRouter
      router = maybeRouter
    } else if (prefixOrRouter instanceof Router) {
      router = prefixOrRouter
    } else {
      throw new Error('Invalid args')
    }

    const duplicateQueries = Object.keys(router._queries).filter((key) => this.hasQuery(key))
    const duplicateMutations = Object.keys(router._mutations).filter((key) => this.hasMutation(key))
    const duplicates = [...duplicateQueries, ...duplicateMutations]
    if (duplicates.length) {
      throw new Error(`Duplicate endpoint(s): ${duplicates.join(', ')}`)
    }
    
    return new Router<TContext>({
      queries: {
        ...this._queries,
        ...prefixEndpoints(router._queries, prefix),
      },
      mutations: {
        ...this._mutations,
        ...prefixEndpoints(router._mutations, prefix),
      }
    })
  }

  public createQueryHandler(ctx: TContext) {
    return async <
      TPath extends keyof TQueries,
      TArgs extends DropFirst<Parameters<TResolver>>,
      TResolver extends TQueries[TPath]
    >(path: TPath, ...args: TArgs): Promise<ReturnType<TResolver>> => {
      const key = (path as string).toLowerCase()
      return this._queries[key](ctx, ...args);
    };
  }

  public createMutationHandler(ctx: TContext) {
    return async <
      TPath extends keyof TMutations,
      TArgs extends DropFirst<Parameters<TResolver>>,
      TResolver extends TMutations[TPath]
    >(path: TPath, ...args: TArgs): Promise<ReturnType<TResolver>> => {
      const key = (path as string).toLowerCase()
      return this._mutations[key](ctx, ...args);
    };
  }

  public hasMutation(path: string) {
    return !!this._mutations[path.toLowerCase()]
  }
  public hasQuery(path: string) {
    return !!this._queries[path.toLowerCase()]
  }
};

export function router<TContext extends {} = {}>() {
  return new Router<TContext>()
}

type ThenArg<T> = T extends PromiseLike<infer U> ? ThenArg<U> : T;

export type inferReturnType<TFunction extends () => any> = ThenArg<
  ReturnType<TFunction>
>;

export type inferQueryData<
  TRouter extends Router<any, Record<TPath, any>, any>,
  TPath extends keyof TRouter['_queries'],
> = inferReturnType<TRouter['_queries'][TPath]>

export type inferQueryArgs<
  TRouter extends Router<any, Record<TPath, any>, any>,
  TPath extends keyof TRouter['_queries'],
> = DropFirst<Parameters<TRouter['_queries'][TPath]>>

export type inferMutationData<
  TRouter extends Router<any, any, Record<TPath, any>>,
  TPath extends keyof TRouter['_mutations'],
> = inferReturnType<TRouter['_mutations'][TPath]>

export type inferMutationArgs<
  TRouter extends Router<any, any, Record<TPath, any>>,
  TPath extends keyof TRouter['_mutations'],
> = DropFirst<Parameters<TRouter['_mutations'][TPath]>>

export type inferHandler<TRouter extends Router> = 
  ReturnType<TRouter['createQueryHandler']>
