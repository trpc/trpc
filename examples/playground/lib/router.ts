import { assertNotBrowser } from './assertNotBrowser';
import { Prefixer, DropFirst, ThenArg } from './types';
assertNotBrowser();

export type RouterResolverFn<TContext = any, TData = any, TArgs extends any[] = any[]> = (
  ctx: TContext,
  ...args: TArgs
) => Promise<TData> | TData;


export type RouterEndpoints<TContext = any> = Record<
  string,
  RouterResolverFn<TContext, any, any>
>;


export type inferAsyncReturnType<TFunction extends (...args: any) => any> = ThenArg<
  ReturnType<TFunction>
>;


export type inferEndpointData<
  TEndpoint extends RouterResolverFn,
> = inferAsyncReturnType<TEndpoint>

export type inferEndpointArgs<
  TEndpoint extends RouterResolverFn,
> = DropFirst<Parameters<TEndpoint>>


export type inferHandler<TEndpoints extends RouterEndpoints> = <
  TArgs extends DropFirst<Parameters<TResolver>>,
  TPath extends keyof TEndpoints & string,
  TResolver extends TEndpoints[TPath]
>(
  path: TPath,
  ...args: TArgs
) => Promise<ReturnType<TResolver>>;

export class Router<
  TContext = any,
  TQueries extends RouterEndpoints<TContext> = {},
  TMutations extends RouterEndpoints<TContext> = {},
  > {
  readonly _queries: TQueries;
  readonly _mutations: TMutations;

  constructor(opts: {queries?: TQueries, mutations?: TMutations} = {}) {
    this._queries = opts.queries ?? {} as TQueries;
    this._mutations = opts.mutations ?? {} as TMutations;
  }

  private static prefixEndpoints<
    TEndpoints extends RouterEndpoints,
    TPrefix extends string
  >(
    endpoints: TEndpoints,
    prefix: TPrefix,
  ): TEndpoints & Prefixer<TEndpoints, TPrefix> {
    return Object.keys(endpoints).reduce((eps, key) => {
      const newKey = `${prefix}${key}`
      eps[newKey] = endpoints[key];
      return eps;
    }, {} as RouterEndpoints<any>) as any;
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
        ...Router.prefixEndpoints(router._queries, prefix),
      },
      mutations: {
        ...this._mutations,
        ...Router.prefixEndpoints(router._mutations, prefix),
      }
    })
  }

  // public invoke<
  //   TEndpoints extends RouterEndpoints, 
  //   TPath extends keyof TEndpoints,
  //   TArgs extends Parameters<TResolver>,
  //   TResolver extends TEndpoints[TPath]
  // >(opts: {
  //   target: TEndpoints,
  //   path: TPath,
  //   ctx: TContext,
  //   args: TArgs,
  // }): Promise<ReturnType<TResolver>> {
  //   return opts.target[opts.path](opts.ctx, ...opts.args)
  // }

  public createMutationHandler(ctx: TContext): inferHandler<this['_mutations']> {
    return (path, ...args) => this._mutations[path](ctx, ...args);
  }
  public createQueryHandler(ctx: TContext): inferHandler<this['_queries']> {
    return (path, ...args) => this._queries[path](ctx, ...args);
  }

  public hasMutation(path: string) {
    return !!this._mutations[path]
  }
  public hasQuery(path: string) {
    return !!this._queries[path]
  }
};

export function router<TContext>() {
  return new Router<TContext>()
}
