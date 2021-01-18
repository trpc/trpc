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

function lowerCaseEndpoints<TEndpoints extends RouterEndpoints<any>>(endpoints: TEndpoints): TEndpoints {
  return Object.keys(endpoints).reduce((eps, key) => {
    eps[key.toLowerCase()] = endpoints[key]
    return eps;
  }, {} as Record<string, any>) as any;
}
export class Router<
  TContext extends {} = {},
  TQueries extends RouterEndpoints<TContext> = {}> {
  readonly _endpoints: TQueries;

  constructor(endpoints?: TQueries) {
    this._endpoints = endpoints ?? {} as TQueries;
  }

  /**
   * Add new endpoints and return router
   * @param endpoints 
   */
  public endpoints<TNewEndpoints extends RouterEndpoints<TContext>>(
    endpoints: TNewEndpoints,
  ): Router<TContext, TQueries & TNewEndpoints> {
    const duplicates = Object.keys(endpoints).filter((key) => this.has(key))
    if (duplicates.length) {
      throw new Error(`Duplicate endpoint(s): ${duplicates.join(', ')}`)
    }
    return new Router({
      ...this._endpoints,
      ...lowerCaseEndpoints(endpoints),
    })
  }

  /**
   * Merge router with other router
   * @param router
   */
  public merge<
    TChildRouter extends Router<TContext, any>
  >(
    router: TChildRouter
  ): Router<TContext, TQueries & TChildRouter['_endpoints']>;

  /**
   * Merge router with other router
   * @param prefix Prefix that this router should live under
   * @param router
   */
  public merge<
    TPath extends string,
    TChildRouter extends Router<TContext, any>
  >(
    prefix: TPath,
    router: TChildRouter
  ): Router<TContext, TQueries & Prefixer<TChildRouter['_endpoints'], `${TPath}`>>;

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

    return Object.keys(router._endpoints).reduce((r, key) => {
      return r.endpoints({[prefix + key]: router._endpoints[key]});
    }, this as any as Router<TContext, any>);
  }


  public handler(ctx: TContext) {
    return async <
      TPath extends keyof TQueries,
      TArgs extends DropFirst<Parameters<TResolver>>,
      TResolver extends TQueries[TPath]
    >(path: TPath, ...args: TArgs): Promise<ReturnType<TResolver>> => {
      const key = (path as string).toLowerCase()
      return this._endpoints[key](ctx, ...args);
    };
  }

  public has(path: string) {
    return !!this._endpoints[path.toLowerCase()]
  }
};

export function router<TContext extends {} = {}>() {
  return new Router<TContext>()
}

type ThenArg<T> = T extends PromiseLike<infer U> ? ThenArg<U> : T;

export type inferReturnType<TFunction extends () => any> = ThenArg<
  ReturnType<TFunction>
>;

export type inferEndpointData<
  TRouter extends Router<any, Record<TPath, any>>,
  TPath extends keyof TRouter['_endpoints'],
> = inferReturnType<TRouter['_endpoints'][TPath]>


export type inferEndpointArgs<
  TRouter extends Router<any, Record<TPath, any>>,
  TPath extends keyof TRouter['_endpoints'],
> = DropFirst<Parameters<TRouter['_endpoints'][TPath]>>

export type inferHandler<TRouter extends Router> = 
  ReturnType<TRouter['handler']>
