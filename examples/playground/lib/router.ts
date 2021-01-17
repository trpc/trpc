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

export class Router<
  TContext extends {} = {},
  TEndpoints extends RouterEndpoints<TContext> = {}> {
  readonly _endpoints: TEndpoints;

  constructor(endpoints?: TEndpoints) {
    this._endpoints = endpoints ?? {} as TEndpoints;
  }

  /**
   * Add endpoint and return router
   * @param path 
   * @param resolver 
   */
  public endpoint<TData, TArgs extends any[], TPath extends string>(
    path: TPath,
    resolver: RouterResolverFn<TContext, TData, TArgs>
  ) {
    if (this.has(path)) {
      throw new Error(`Duplicate endpoint "${path}"`)
    }
    const route = {
      [path]: resolver,
    } as Record<TPath, typeof resolver>;

    return new Router<TContext, TEndpoints & typeof route>({
      ...this._endpoints,
      ...route,
    });
  }
  /**
   * Add new endpoints and return router
   * @param endpoints 
   */
  public endpoints<TNewEndpoints extends RouterEndpoints<TContext>>(
    endpoints: TNewEndpoints,
  ) {
    for (const path in endpoints) {
      if (this.has(path)) {
        throw new Error(`Duplicate endpoint "${path}"`)
      }
    }
    return new Router<TContext, TEndpoints & TNewEndpoints>({
      ...this._endpoints,
      ...endpoints,
    });
  }

  /**
   * Merge router with other router
   * @param router
   */
  public merge<
    TChildRouter extends Router<TContext, any>
  >(
    router: TChildRouter
  ): Router<TContext, TEndpoints & TChildRouter['_endpoints']>;

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
  ): Router<TContext, TEndpoints & Prefixer<TChildRouter['_endpoints'], `${TPath}`>>;

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
      return r.endpoint(prefix + key, router._endpoints[key]);
    }, this as any as Router<TContext, any>);
  }


  public handler(ctx: TContext) {
    return async <
      TPath extends keyof TEndpoints,
      TArgs extends DropFirst<Parameters<TResolver>>,
      TResolver extends TEndpoints[TPath]
    >(path: TPath, ...args: TArgs): Promise<ReturnType<TResolver>> => {
      return this._endpoints[path](ctx, ...args);
    };
  }

  public has(path: string) {
    return !!this._endpoints[path]
  }
};

export function router<TContext extends {} = {}>() {
  return new Router<TContext>()
}

