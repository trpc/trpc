/* eslint-disable @typescript-eslint/ban-types */
/* eslint-disable @typescript-eslint/no-explicit-any */
import { assertNotBrowser } from './assertNotBrowser';
import { InputValidationError } from './errors';
import { Subscription } from './subscription';
import { flatten, Prefixer, ThenArg } from './types';
assertNotBrowser();

export type RouteInput<TInput = unknown> = {
  parse: (input: unknown) => TInput;
};

export type RouteResolver<
  TContext = unknown,
  TInput = unknown,
  TOutput = unknown
> = (opts: { ctx: TContext; input: TInput }) => Promise<TOutput> | TOutput;

export type RouteWithInput<
  TContext = unknown,
  TInput = unknown,
  TOutput = unknown
> = {
  input: RouteInput<TInput>;
  resolve: RouteResolver<TContext, TInput, TOutput>;
};

export type RouteWithoutInput<
  TContext = unknown,
  TInput = unknown,
  TOutput = unknown
> = {
  input?: undefined;
  resolve: RouteResolver<TContext, TInput, TOutput>;
};
export type Route<TContext = unknown, TInput = unknown, TOutput = unknown> =
  | RouteWithInput<TContext, TInput, TOutput>
  | RouteWithoutInput<TContext, TInput, TOutput>;

export type inferRouteInput<
  TRoute extends Route<any, any, any>
> = TRoute extends Route<any, infer Input, any> ? Input : never;

// export type RouteInput<TInput = unknown> = {
//   parse: (input: unknown) => TInput;
// };

// export type RouteResolver<
//   TContext = unknown,
//   TInput = unknown,
//   TOutput = unknown
// > = (opts: { ctx: TContext; input: TInput }) => Promise<TOutput> | TOutput;

// export type Route<
//   TContext = unknown,
//   TInput = unknown,
//   TOutput = unknown
// > = {
//   input?: RouteInput<TInput>;
//   resolve: RouteResolver<TContext, TInput, TOutput>;
// };

export type RouteRecord<
  TContext = unknown,
  TInput = unknown,
  TOutput = unknown
> = Record<string, Route<TContext, TInput, TOutput>>;

export type inferAsyncReturnType<
  TFunction extends (...args: any) => any
> = ThenArg<ReturnType<TFunction>>;

export type inferRouteOutput<TRoute extends Route> = inferAsyncReturnType<
  TRoute['resolve']
>;

export type AnyRouter<TContext = any> = Router<
  TContext,
  RouteRecord<TContext>,
  RouteRecord<TContext>,
  RouteRecord<TContext, any, Subscription<any>>
>;

// export type inferRouteInput<
//   TRoute extends Route<any, any, any>
// > = TRoute['input'] extends RouteInput<any>
//   ? ReturnType<TRoute['input']['parse']>
//   : undefined;

export class Router<
  TContext,
  TQueries extends RouteRecord<TContext>,
  TMutations extends RouteRecord<TContext>,
  TSubscriptions extends RouteRecord<TContext, any, Subscription<any>>
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

  private static prefixRoutes<
    TRoutes extends RouteRecord,
    TPrefix extends string
  >(routes: TRoutes, prefix: TPrefix): Prefixer<TRoutes, TPrefix> {
    const eps: RouteRecord = {};
    for (const key in routes) {
      eps[prefix + key] = routes[key];
    }
    return eps as any;
  }

  public query<TPath extends string, TInput, TOutput>(
    path: TPath,
    route: RouteWithInput<TContext, TInput, TOutput>,
  ): Router<
    TContext,
    TQueries & Record<TPath, typeof route>,
    TMutations,
    TSubscriptions
  >;
  public query<TPath extends string, TInput, TOutput>(
    path: TPath,
    route: RouteWithoutInput<TContext, TInput, TOutput>,
  ): Router<
    TContext,
    TQueries & Record<TPath, typeof route>,
    TMutations,
    TSubscriptions
  >;
  public query(path: any, route: any) {
    const router = new Router({
      queries: {
        [path]: route,
      } as any,
      mutations: {},
      subscriptions: {},
    });

    return this.merge(router) as any;
  }

  // public mutations<TNewRoutes extends RouteRecord<TContext>>(
  //   routes: TNewRoutes,
  // ): Router<
  //   TContext,
  //   TQueries,
  //   flatten<TMutations, TNewRoutes>,
  //   TSubscriptions
  // > {
  //   const router = new Router<TContext, {}, TNewRoutes, {}>({
  //     mutations: routes,
  //     queries: {},
  //     subscriptions: {},
  //   });

  //   return this.merge(router) as any;
  // }

  // public subscriptions<
  //   TNewRoutes extends RouteRecord<TContext, Subscription>
  // >(
  //   routes: TNewRoutes,
  // ): Router<
  //   TContext,
  //   TQueries,
  //   TMutations,
  //   flatten<TSubscriptions, TNewRoutes>
  // > {
  //   const router = new Router<TContext, {}, {}, TNewRoutes>({
  //     subscriptions: routes,
  //     queries: {},
  //     mutations: {},
  //   });

  //   return this.merge(router) as any;
  // }

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
        ...Router.prefixRoutes(router._def.queries, prefix),
      },
      mutations: {
        ...this._def.mutations,
        ...Router.prefixRoutes(router._def.mutations, prefix),
      },
      subscriptions: {
        ...this._def.subscriptions,
        ...Router.prefixRoutes(router._def.subscriptions, prefix),
      },
    });
  }

  public async invokeQuery<TPath extends keyof TQueries>(opts: {
    ctx: TContext;
    path: TPath;
    input: inferRouteInput<TQueries[TPath]>;
  }): Promise<inferAsyncReturnType<TQueries[TPath]['resolve']>> {
    const route = this._def.queries[opts.path];

    if (route.input) {
      try {
        const parsed = route.input.parse(opts.input);
        return route.resolve({ ctx: opts.ctx, input: parsed }) as any;
      } catch (_err) {
        const err = new InputValidationError(_err);
        throw err;
      }
    }
    return route.resolve({ ctx: opts.ctx, input: undefined }) as any;
  }

  // public invokeMutation(
  //   ctx: TContext,
  // ): inferHandler<this['_def']['mutations']> {
  //   return (path, ...args) => (this._def.mutations[path] as any)(ctx, ...args);
  // }
  // public invokeQuery(ctx: TContext): inferHandler<this['_def']['queries']> {
  //   return (path, ...args) => (this._def.queries[path] as any)(ctx, ...args);
  // }
  // public invokeSubscription(
  //   ctx: TContext,
  // ): inferHandler<this['_def']['subscriptions']> {
  //   return (path, ...args) => {
  //     return (this._def.subscriptions[path] as any)(ctx, ...args);
  //   };
  // }

  public has(what: 'subscriptions' | 'mutations' | 'queries', path: string) {
    return !!this._def[what][path];
  }
  // public static routerDef<TContext, TInput, TOutput>(
  //   def: Route<TContext, TInput, TOutput>,
  // ): RouterResolverFn<TContext, TOutput, [TInput]> {
  //   return async (ctx, input: inferRouteInput<typeof def>) => {
  //     let parsed: TInput;
  //     try {
  //       parsed = def.input.parse(input);
  //     } catch (_err) {
  //       const err = new InputValidationError(_err);
  //       throw err;
  //     }
  //     const data = await def.resolve({ ctx, input: parsed });
  //     return data;
  //   };
  // }

  // public query<TPath extends string, TInput, TOutput>(
  //   path: TPath,
  //   def: Route<TContext, TInput, TOutput>,
  // ) {
  //   const resolver = Router.routerDef(def);
  //   return this.queries({
  //     [path]: resolver,
  //   } as Record<TPath, typeof resolver>);
  // }
  // public mutation<TPath extends string, TInput, TOutput>(
  //   path: TPath,
  //   def: Route<TContext, TInput, TOutput>,
  // ) {
  //   const resolver = Router.routerDef(def);
  //   return this.mutations({
  //     [path]: resolver,
  //   } as Record<TPath, typeof resolver>);
  // }
  // public subscription<
  //   TPath extends string,
  //   TInput,
  //   TOutput extends Subscription
  // >(path: TPath, def: Route<TContext, TInput, TOutput>) {
  //   const resolver = Router.routerDef(def);
  //   return this.subscriptions({
  //     [path]: resolver,
  //   } as Record<TPath, typeof resolver>);
  // }

  // /**
  //  * FIXME
  //  * the input argument will be `unknown`, not inferred properly
  //  */
  // public __fixme_queriesv2<
  //   TRoutes extends RouteRecord<TContext, TInput, TOutput>,
  //   TInput,
  //   TOutput
  // >(routes: TRoutes) {
  //   const keys = Object.keys(routes) as (keyof TRoutes)[];
  //   const objs = keys.reduce((sum, key) => {
  //     const resolver = Router.routerDef(routes[key]);
  //     const obj = {
  //       [key]: resolver,
  //     } as Record<typeof key, typeof resolver>;

  //     return {
  //       ...sum,
  //       ...obj,
  //     };
  //   }, ({} as unknown) as RouteRecordToEndpoint<TRoutes, TContext, TInput, TOutput>);

  //   return this.queries(objs);
  // }
}

export function router<TContext>() {
  return new Router<TContext, {}, {}, {}>();
}
