import { assertNotBrowser } from './assertNotBrowser';
import { Prefixer, DropFirst, ThenArg } from './types';
assertNotBrowser();

export type RouterResolverFn<
  TContext = any,
  TData = any,
  TArgs extends any[] = any[]
> = (ctx: TContext, ...args: TArgs) => Promise<TData> | TData;

export type RouterEndpoints<TContext = any> = Record<
  string,
  RouterResolverFn<TContext, any, any>
>;

export type inferAsyncReturnType<
  TFunction extends (...args: any) => any
> = ThenArg<ReturnType<TFunction>>;

export type inferEndpointData<
  TEndpoint extends RouterResolverFn
> = inferAsyncReturnType<TEndpoint>;

export type inferEndpointArgs<TEndpoint extends RouterResolverFn> = DropFirst<
  Parameters<TEndpoint>
>;

export type inferHandler<TEndpoints extends RouterEndpoints> = <
  TArgs extends DropFirst<Parameters<TResolver>>,
  TPath extends keyof TEndpoints & string,
  TResolver extends TEndpoints[TPath]
>(
  path: TPath,
  ...args: TArgs
) => Promise<ReturnType<TResolver>>;


export type inferEndpointsWithArgs<TEndpoints extends RouterEndpoints> = {
  [Key in keyof TEndpoints]: inferEndpointArgs<TEndpoints[Key]> extends ([any])
    ? Key
    : never;
}[keyof TEndpoints];

export type inferEndpointsWithoutArgs<
  TEndpoints extends RouterEndpoints
> = keyof Omit<TEndpoints, inferEndpointsWithArgs<TEndpoints>>;

export class Router<
  TContext = any,
  TQueries extends RouterEndpoints<TContext> = {},
  TMutations extends RouterEndpoints<TContext> = {},
  > {
  readonly _def: Readonly<{
    queries: Readonly<TQueries>;
    mutations: Readonly<TMutations>;
  }>

  constructor(def?: {queries: TQueries, mutations: TMutations}) {
    this._def = def ?? {
      queries: {} as TQueries,
      mutations: {} as TMutations,
    };
  }

  private static prefixEndpoints<
    TEndpoints extends RouterEndpoints,
    TPrefix extends string
  >(
    endpoints: TEndpoints,
    prefix: TPrefix,
  ): Prefixer<TEndpoints, TPrefix> {
    let eps: RouterEndpoints = {}
    for (const key in endpoints) {
      eps[prefix + key] = endpoints[key]
    }
    return eps as any;
  }
  
  /**
   * Add new queries and return router
   * @param queries 
   */
  public queries<TNewEndpoints extends RouterEndpoints<TContext>>(
    endpoints: TNewEndpoints,
  ): Router<TContext, TQueries & TNewEndpoints, TMutations> {
    const router = new Router<TContext, TNewEndpoints>({ queries: endpoints, mutations: {} })
    return this.merge(router)
  }

  /**
   * Add new mutations and return router
   * @param mutations 
   */
  public mutations<TNewEndpoints extends RouterEndpoints<TContext>>(
    endpoints: TNewEndpoints,
  ): Router<TContext, TQueries, TMutations & TNewEndpoints> {
    const router = new Router<TContext, {}, TNewEndpoints>({ mutations: endpoints, queries: {} });

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
      TQueries & TChildRouter['_def']['queries'], 
      TMutations & TChildRouter['_def']['mutations']
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
      TQueries & Prefixer<TChildRouter['_def']['queries'], `${TPath}`>, 
      TMutations & Prefixer<TChildRouter['_def']['mutations'], `${TPath}`>
    >;

  public merge(prefixOrRouter: unknown, maybeRouter?: unknown) {
    let prefix = ''
    let router: Router;
    
    if (typeof prefixOrRouter === 'string' && maybeRouter instanceof Router) {
      prefix = prefixOrRouter
      router = maybeRouter
    } else if (prefixOrRouter instanceof Router) {
      router = prefixOrRouter
    } else {
      throw new Error('Invalid args')
    }

    const duplicateQueries = Object.keys(router._def.queries).filter((key) => this.hasQuery(key))
    const duplicateMutations = Object.keys(router._def.mutations).filter((key) => this.hasMutation(key))
    const duplicates = [...duplicateQueries, ...duplicateMutations]
    if (duplicates.length) {
      throw new Error(`Duplicate endpoint(s): ${duplicates.join(', ')}`)
    }
    
    return new Router<TContext>({
      queries: {
        ...this._def.queries,
        ...Router.prefixEndpoints(router._def.queries, prefix),
      },
      mutations: {
        ...this._def.mutations,
        ...Router.prefixEndpoints(router._def.mutations, prefix),
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

  public createMutationHandler(ctx: TContext): inferHandler<this['_def']['mutations']> {
    return (path, ...args) => this._def.mutations[path](ctx, ...args);
  }
  public createQueryHandler(ctx: TContext): inferHandler<this['_def']['queries']> {
    return (path, ...args) => this._def.queries[path](ctx, ...args);
  }

  public hasMutation(path: string) {
    return !!this._def.mutations[path]
  }
  public hasQuery(path: string) {
    return !!this._def.queries[path]
  }
};

export function router<TContext>() {
  return new Router<TContext>()
}
