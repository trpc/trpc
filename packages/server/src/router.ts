/* eslint-disable @typescript-eslint/ban-types */
/* eslint-disable @typescript-eslint/no-explicit-any */
import { assertNotBrowser } from './assertNotBrowser';
import { inferSubscriptionData, Subscription } from './subscription';
import { DropFirst, format, Prefixer, ThenArg } from './types';
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

export type DataTransformer = {
  serialize(object: any): any;
  deserialize(object: any): any;
};

export type AnyRouter = Router<any, any, any, any>;
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
    transformers: DataTransformer[];
  }>;

  constructor(def?: {
    queries: TQueries;
    mutations: TMutations;
    subscriptions: TSubscriptions;
    transformers: DataTransformer[];
  }) {
    this._def = def ?? {
      queries: {} as TQueries,
      mutations: {} as TMutations,
      subscriptions: {} as TSubscriptions,
      transformers: [] as DataTransformer[],
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

  public transformer(transformer: DataTransformer) {
    this._def.transformers.push(transformer);
    return this;
  }

  public queries<TNewEndpoints extends RouterEndpoints<TContext>>(
    endpoints: TNewEndpoints,
  ): Router<
    TContext,
    format<TQueries & TNewEndpoints>,
    TMutations,
    TSubscriptions
  > {
    const router = new Router<TContext, format<TNewEndpoints>, {}, {}>({
      queries: endpoints,
      mutations: {},
      subscriptions: {},
      transformers: [],
    });
    return this.merge(router);
  }

  public mutations<TNewEndpoints extends RouterEndpoints<TContext>>(
    endpoints: TNewEndpoints,
  ): Router<
    TContext,
    TQueries,
    format<TMutations & TNewEndpoints>,
    TSubscriptions
  > {
    const router = new Router<TContext, {}, TNewEndpoints, {}>({
      mutations: endpoints,
      queries: {},
      subscriptions: {},
      transformers: [],
    });

    return this.merge(router);
  }

  public subscriptions<
    TNewEndpoints extends RouterEndpoints<TContext, Subscription>
  >(
    endpoints: TNewEndpoints,
  ): Router<
    TContext,
    TQueries,
    TMutations,
    format<TSubscriptions & TNewEndpoints>
  > {
    const router = new Router<TContext, {}, {}, TNewEndpoints>({
      subscriptions: endpoints,
      queries: {},
      mutations: {},
      transformers: [],
    });

    return this.merge(router);
  }

  /**
   * Merge router with other router
   * @param router
   */
  public merge<TChildRouter extends Router<TContext, any, any, any>>(
    router: TChildRouter,
  ): Router<
    TContext,
    TQueries & TChildRouter['_def']['queries'],
    TMutations & TChildRouter['_def']['mutations'],
    TSubscriptions & TChildRouter['_def']['subscriptions']
  >;

  /**
   * Merge router with other router
   * @param prefix Prefix that this router should live under
   * @param router
   */
  public merge<
    TPath extends string,
    TChildRouter extends Router<TContext, any, any, any>
  >(
    prefix: TPath,
    router: TChildRouter,
  ): Router<
    TContext,
    TQueries & Prefixer<TChildRouter['_def']['queries'], `${TPath}`>,
    TMutations & Prefixer<TChildRouter['_def']['mutations'], `${TPath}`>,
    TSubscriptions & Prefixer<TChildRouter['_def']['subscriptions'], `${TPath}`>
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
      transformers: [...this._def.transformers, ...router._def.transformers],
    });
  }

  public async serializeData<TData>(promise: TData | Promise<TData>) {
    const data = await promise;
    return this._def.transformers.reduce(
      (prev, transformer) => transformer.serialize(prev),
      data,
    );
  }

  private deserializeArgs(args: unknown[]) {
    return args.map((arg) =>
      this._def.transformers.reduce(
        (prev, transformer) => transformer.deserialize(prev),
        arg,
      ),
    );
  }

  public invokeMutation(
    ctx: TContext,
  ): inferHandler<this['_def']['mutations']> {
    return (path, ...args) =>
      this.serializeData(
        (this._def.mutations[path] as any)(ctx, ...this.deserializeArgs(args)),
      );
  }
  public invokeQuery(ctx: TContext): inferHandler<this['_def']['queries']> {
    return (path, ...args) =>
      this.serializeData(
        (this._def.queries[path] as any)(ctx, ...this.deserializeArgs(args)),
      );
  }
  public invokeSubscription(
    ctx: TContext,
  ): inferHandler<this['_def']['subscriptions']> {
    return (path, ...args) => {
      return (this._def.subscriptions[path] as any)(
        ctx,
        ...this.deserializeArgs(args),
      );
    };
  }

  public has(what: 'subscriptions' | 'mutations' | 'queries', path: string) {
    return !!this._def[what][path];
  }
}

export function router<TContext>() {
  return new Router<TContext, {}, {}, {}>();
}
