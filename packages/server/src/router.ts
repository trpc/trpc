/* eslint-disable @typescript-eslint/ban-types */
/* eslint-disable @typescript-eslint/no-explicit-any */
import { assertNotBrowser } from './assertNotBrowser';
import { InputValidationError } from './errors';
import { inferSubscriptionData, Subscription } from './subscription';
import { DropFirst, flatten, format, Prefixer, ThenArg } from './types';
assertNotBrowser();

export type RouterResolverFn<
  TContext = any,
  TData = any,
  TArgs extends any[] = any[]
> = (ctx: TContext, ...args: TArgs) => Promise<TData> | TData;

export type RouterEndpoints<TContext = any, TData = any> = Record<
  string,
  RouterResolverFn<TContext, TData>
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

export type inferRouterSubscriptionEndpointData<
  TRouter extends AnyRouter,
  TPath extends keyof TRouter['_def']['subscriptions']
> = inferSubscriptionData<
  inferAsyncReturnType<TRouter['_def']['subscriptions'][TPath]>
>;

export type inferHandler<TEndpoints extends RouterEndpoints> = <
  TArgs extends DropFirst<Parameters<TResolver>> & any[],
  TPath extends keyof TEndpoints & string,
  TResolver extends TEndpoints[TPath]
>(
  path: TPath,
  ...args: TArgs
) => Promise<ReturnType<TResolver>>;

export type inferEndpointsWithArgs<TEndpoints extends RouterEndpoints> = {
  [Key in keyof TEndpoints]: inferEndpointArgs<TEndpoints[Key]> extends [any]
    ? Key
    : never;
}[keyof TEndpoints];

export type inferEndpointsWithoutArgs<
  TEndpoints extends RouterEndpoints
> = keyof Omit<TEndpoints, inferEndpointsWithArgs<TEndpoints>>;

export type AnyRouter<Context = any> = Router<
  Context,
  RouterEndpoints<any>,
  RouterEndpoints<any>,
  RouterEndpoints<any, Subscription<any>>
>;

export type RouteDef<TContext = any, TInput = any, TData = any> = {
  input: {
    parse: (input: unknown) => TInput;
  };
  resolve: (opts: { ctx: TContext; input: TInput }) => Promise<TData> | TData;
};
export type RouteDefRecord<TContext = any, TInput = any, TData = any> = Record<
  string,
  RouteDef<TContext, TInput, TData>
>;

export type RouteDefRecordToEndpoint<
  TRouteDefs extends RouteDefRecord<TContext, TInput, TData>,
  TContext = unknown,
  TInput = unknown,
  TData = unknown
> = {
  [TKey in keyof TRouteDefs]: RouterResolverFn<
    TContext,
    inferAsyncReturnType<TRouteDefs[TKey]['resolve']>,
    [ReturnType<TRouteDefs[TKey]['input']['parse']>]
  >;
};

export type inferRouteInput<TDef extends RouteDef<any, any, any>> = ReturnType<
  TDef['input']['parse']
>;

export class Router<
  TContext,
  TQueries extends RouterEndpoints<TContext>,
  TMutations extends RouterEndpoints<TContext>,
  TSubscriptions extends RouterEndpoints<TContext, Subscription<any>>
> {
  readonly _def: Readonly<{
    queries: Readonly<TQueries>;
    mutations: Readonly<TMutations>;
    subscriptions: Readonly<TSubscriptions>;
  }>;

  constructor(def?: {
    queries: TQueries;
    mutations: TMutations;
    subscriptions: TSubscriptions;
  }) {
    this._def = def ?? {
      queries: {} as TQueries,
      mutations: {} as TMutations,
      subscriptions: {} as TSubscriptions,
    };
  }

  private static prefixEndpoints<
    TEndpoints extends RouterEndpoints,
    TPrefix extends string
  >(endpoints: TEndpoints, prefix: TPrefix): Prefixer<TEndpoints, TPrefix> {
    const eps: RouterEndpoints = {};
    for (const key in endpoints) {
      eps[prefix + key] = endpoints[key];
    }
    return eps as any;
  }

  public queries<TNewEndpoints extends RouterEndpoints<TContext>>(
    endpoints: TNewEndpoints,
  ): Router<
    TContext,
    flatten<TQueries, TNewEndpoints>,
    TMutations,
    TSubscriptions
  > {
    const router = new Router<TContext, format<TNewEndpoints>, {}, {}>({
      queries: endpoints,
      mutations: {},
      subscriptions: {},
    });
    return this.merge(router) as any;
  }

  public mutations<TNewEndpoints extends RouterEndpoints<TContext>>(
    endpoints: TNewEndpoints,
  ): Router<
    TContext,
    TQueries,
    flatten<TMutations, TNewEndpoints>,
    TSubscriptions
  > {
    const router = new Router<TContext, {}, TNewEndpoints, {}>({
      mutations: endpoints,
      queries: {},
      subscriptions: {},
    });

    return this.merge(router) as any;
  }

  public subscriptions<
    TNewEndpoints extends RouterEndpoints<TContext, Subscription>
  >(
    endpoints: TNewEndpoints,
  ): Router<
    TContext,
    TQueries,
    TMutations,
    flatten<TSubscriptions, TNewEndpoints>
  > {
    const router = new Router<TContext, {}, {}, TNewEndpoints>({
      subscriptions: endpoints,
      queries: {},
      mutations: {},
    });

    return this.merge(router) as any;
  }

  /**
   * Merge router with other router
   * @param router
   */
  public merge<TChildRouter extends AnyRouter<TContext>>(
    router: TChildRouter,
  ): Router<
    TContext,
    flatten<TQueries, TChildRouter['_def']['queries']>,
    flatten<TMutations, TChildRouter['_def']['mutations']>,
    flatten<TSubscriptions, TChildRouter['_def']['subscriptions']>
  >;

  /**
   * Merge router with other router
   * @param prefix Prefix that this router should live under
   * @param router
   */
  public merge<TPath extends string, TChildRouter extends AnyRouter<TContext>>(
    prefix: TPath,
    router: TChildRouter,
  ): Router<
    TContext,
    flatten<TQueries, Prefixer<TChildRouter['_def']['queries'], `${TPath}`>>,
    flatten<
      TMutations,
      Prefixer<TChildRouter['_def']['mutations'], `${TPath}`>
    >,
    flatten<
      TSubscriptions,
      Prefixer<TChildRouter['_def']['subscriptions'], `${TPath}`>
    >
  >;

  public merge(prefixOrRouter: unknown, maybeRouter?: unknown) {
    let prefix = '';
    let router: AnyRouter;

    if (typeof prefixOrRouter === 'string' && maybeRouter instanceof Router) {
      prefix = prefixOrRouter;
      router = maybeRouter;
    } else if (prefixOrRouter instanceof Router) {
      router = prefixOrRouter;
    } else {
      throw new Error('Invalid args');
    }

    const duplicateQueries = Object.keys(router._def.queries).filter((key) =>
      this.has('queries', key),
    );
    const duplicateMutations = Object.keys(
      router._def.mutations,
    ).filter((key) => this.has('mutations', key));
    const duplicateSubscriptions = Object.keys(
      router._def.subscriptions,
    ).filter((key) => this.has('subscriptions', key));

    const duplicates = [
      ...duplicateQueries,
      ...duplicateMutations,
      ...duplicateSubscriptions,
    ];
    if (duplicates.length) {
      throw new Error(`Duplicate endpoint(s): ${duplicates.join(', ')}`);
    }

    return new Router<TContext, any, any, any>({
      queries: {
        ...this._def.queries,
        ...Router.prefixEndpoints(router._def.queries, prefix),
      },
      mutations: {
        ...this._def.mutations,
        ...Router.prefixEndpoints(router._def.mutations, prefix),
      },
      subscriptions: {
        ...this._def.subscriptions,
        ...Router.prefixEndpoints(router._def.subscriptions, prefix),
      },
    });
  }

  public invokeMutation(
    ctx: TContext,
  ): inferHandler<this['_def']['mutations']> {
    return (path, ...args) => (this._def.mutations[path] as any)(ctx, ...args);
  }
  public invokeQuery(ctx: TContext): inferHandler<this['_def']['queries']> {
    return (path, ...args) => (this._def.queries[path] as any)(ctx, ...args);
  }
  public invokeSubscription(
    ctx: TContext,
  ): inferHandler<this['_def']['subscriptions']> {
    return (path, ...args) => {
      return (this._def.subscriptions[path] as any)(ctx, ...args);
    };
  }

  public has(what: 'subscriptions' | 'mutations' | 'queries', path: string) {
    return !!this._def[what][path];
  }
  public static routerDef<TContext, TInput, TData>(
    def: RouteDef<TContext, TInput, TData>,
  ): RouterResolverFn<TContext, TData, [TInput]> {
    return async (ctx, input: inferRouteInput<typeof def>) => {
      let parsed: TInput;
      try {
        parsed = def.input.parse(input);
      } catch (_err) {
        const err = new InputValidationError(_err);
        throw err;
      }
      const data = await def.resolve({ ctx, input: parsed });
      return data;
    };
  }

  public query<TPath extends string, TInput, TData>(
    path: TPath,
    def: RouteDef<TContext, TInput, TData>,
  ) {
    const resolver = Router.routerDef(def);
    return this.queries({
      [path]: resolver,
    } as Record<TPath, typeof resolver>);
  }
  public mutation<TPath extends string, TInput, TData>(
    path: TPath,
    def: RouteDef<TContext, TInput, TData>,
  ) {
    const resolver = Router.routerDef(def);
    return this.mutations({
      [path]: resolver,
    } as Record<TPath, typeof resolver>);
  }
  public subscription<TPath extends string, TInput, TData extends Subscription>(
    path: TPath,
    def: RouteDef<TContext, TInput, TData>,
  ) {
    const resolver = Router.routerDef(def);
    return this.subscriptions({
      [path]: resolver,
    } as Record<TPath, typeof resolver>);
  }

  /**
   * FIXME
   * the input argument will be `unknown`, not inferred properly
   */
  public __fixme_queriesv2<
    TEndpoints extends RouteDefRecord<TContext, TInput, TData>,
    TInput,
    TData
  >(endpoints: TEndpoints) {
    const keys = Object.keys(endpoints) as (keyof TEndpoints)[];
    const objs = keys.reduce((sum, key) => {
      const resolver = Router.routerDef(endpoints[key]);
      const obj = {
        [key]: resolver,
      } as Record<typeof key, typeof resolver>;

      return {
        ...sum,
        ...obj,
      };
    }, ({} as unknown) as RouteDefRecordToEndpoint<TEndpoints, TContext, TInput, TData>);

    return this.queries(objs);
  }
}

export function router<TContext>() {
  return new Router<TContext, {}, {}, {}>();
}
