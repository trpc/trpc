/* eslint-disable @typescript-eslint/ban-types */
/* eslint-disable @typescript-eslint/no-explicit-any */

import { assertNotBrowser } from './assertNotBrowser';
import { InputValidationError, RouteNotFoundError } from './errors';
import { Subscription } from './subscription';
import { format, Prefixer, ThenArg } from './types';
assertNotBrowser();

export type RouteInputParserZodEsque<TInput = unknown> = {
  parse: (input: any) => TInput;
};

export type RouteInputParserCustomValidatorEsque<TInput = unknown> = (
  input: unknown,
) => TInput;

export type RouteInputParserYupEsque<TInput = unknown> = {
  validateSync: (input: unknown) => TInput;
};
export type RouteInputParser<TInput = unknown> =
  | RouteInputParserZodEsque<TInput>
  | RouteInputParserYupEsque<TInput>
  | RouteInputParserCustomValidatorEsque<TInput>;

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
  input: RouteInputParser<TInput>;
  resolve: RouteResolver<TContext, TInput, TOutput>;
};

export type RouteWithoutInput<
  TContext = unknown,
  TInput = unknown,
  TOutput = unknown
> = {
  input?: undefined | null;
  resolve: RouteResolver<TContext, TInput, TOutput>;
};
export type Route<TContext = unknown, TInput = unknown, TOutput = unknown> = (
  | RouteWithInput<TContext, TInput, TOutput>
  | RouteWithoutInput<TContext, TInput, TOutput>
) & {
  _middlewares?: MiddlewareFunction<TContext>[];
};

export type RouteRecord<
  TContext = unknown,
  TInput = unknown,
  TOutput = unknown
> = Record<string, Route<TContext, TInput, TOutput>>;

export type inferRouteInput<
  TRoute extends Route<any, any, any>
> = TRoute extends RouteWithInput<any, infer Input, any> ? Input : never;

export type inferAsyncReturnType<
  TFunction extends (...args: any) => any
> = ThenArg<ReturnType<TFunction>>;

export type inferRouteOutput<TRoute extends Route> = inferAsyncReturnType<
  TRoute['resolve']
>;
export type inferSubscriptionOutput<
  TRouter extends AnyRouter,
  TPath extends keyof TRouter['_def']['subscriptions']
> = ReturnType<
  inferAsyncReturnType<
    TRouter['_def']['subscriptions'][TPath]['resolve']
  >['output']
>;

export type inferHandlerInput<
  TRoute extends Route
> = TRoute extends RouteWithInput<any, any, any>
  ? [inferRouteInput<TRoute>]
  : [undefined?];

export type inferHandlerFn<TRoutes extends RouteRecord<any, any, any>> = <
  TRoute extends TRoutes[TPath],
  TPath extends keyof TRoutes & string
>(
  path: TPath,
  ...args: TRoute extends RouteWithInput<any, any, any>
    ? [inferRouteInput<TRoute>]
    : [undefined?]
) => Promise<inferRouteOutput<TRoutes[TPath]>>;

export type AnyRouter<TContext = any> = Router<TContext, any, any, any, any>;

export type MiddlewareFunction<TContext> = (opts: {
  ctx: TContext;
}) => Promise<void> | void;
export class Router<
  TContext,
  TQueries extends RouteRecord<TContext>,
  TMutations extends RouteRecord<TContext>,
  TSubscriptions extends RouteRecord<TContext, unknown, Subscription<unknown>>,
  TMiddleware extends MiddlewareFunction<TContext>
> {
  readonly _def: Readonly<{
    queries: Readonly<TQueries>;
    mutations: Readonly<TMutations>;
    subscriptions: Readonly<TSubscriptions>;
    middlewares: TMiddleware[];
  }>;

  constructor(def?: {
    queries: TQueries;
    mutations: TMutations;
    subscriptions: TSubscriptions;
    middlewares: TMiddleware[];
  }) {
    this._def = def ?? {
      queries: {} as TQueries,
      mutations: {} as TMutations,
      subscriptions: {} as TSubscriptions,
      middlewares: [],
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
    route: Route<TContext, TInput, TOutput>,
  ): Router<
    TContext,
    format<TQueries & Record<TPath, typeof route>>,
    TMutations,
    TSubscriptions,
    TMiddleware
  > {
    const router = new Router<TContext, any, {}, {}, any>({
      queries: {
        [path]: route,
      } as any,
      mutations: {},
      subscriptions: {},
      middlewares: [],
    }) as AnyRouter;

    return this.merge(router);
  }

  // TODO / help: https://github.com/trpc/trpc/pull/37
  // public queries<TRoutes extends RouteRecord<TContext, any, any>>(
  //   routes: TRoutes,
  // ): Router<TContext, TQueries & TRoutes, TMutations, TSubscriptions> {
  //   const router = new Router<TContext, any, {}, {}>({
  //     queries: routes,
  //     mutations: {},
  //     subscriptions: {},
  //   });

  //   return this.merge(router) as any;
  // }

  public mutation<TPath extends string, TInput, TOutput>(
    path: TPath,
    route: Route<TContext, TInput, TOutput>,
  ): Router<
    TContext,
    TQueries,
    format<TMutations & Record<TPath, typeof route>>,
    TSubscriptions,
    TMiddleware
  > {
    const router = new Router({
      queries: {},
      mutations: {
        [path]: route,
      } as any,
      subscriptions: {},
      middlewares: [],
    }) as AnyRouter;

    return this.merge(router);
  }

  /**
   * ⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️
   *  **Experimental.** API might change without major version bump
   * ⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠
   */
  public subscription<
    TPath extends string,
    TInput,
    TOutput extends Subscription
  >(
    path: TPath,
    route: Route<TContext, TInput, TOutput>,
  ): Router<
    TContext,
    TQueries,
    TMutations,
    format<TSubscriptions & Record<TPath, typeof route>>,
    TMiddleware
  > {
    const router = new Router({
      queries: {},
      mutations: {},
      subscriptions: {
        [path]: route,
      } as any,
      middlewares: [],
    }) as AnyRouter;

    return this.merge(router);
  }

  /**
   * Merge router with other router
   * @param router
   */
  public merge<TChildRouter extends AnyRouter<TContext>>(
    router: TChildRouter,
  ): Router<
    TContext,
    format<TQueries & TChildRouter['_def']['queries']>,
    format<TMutations & TChildRouter['_def']['mutations']>,
    format<TSubscriptions & TChildRouter['_def']['subscriptions']>,
    TMiddleware
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
    TQueries & Prefixer<TChildRouter['_def']['queries'], `${TPath}`>,
    TMutations & Prefixer<TChildRouter['_def']['mutations'], `${TPath}`>,
    TSubscriptions &
      Prefixer<TChildRouter['_def']['subscriptions'], `${TPath}`>,
    TMiddleware
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
      this.has('queries', prefix + key),
    );
    const duplicateMutations = Object.keys(
      router._def.mutations,
    ).filter((key) => this.has('mutations', prefix + key));
    const duplicateSubscriptions = Object.keys(
      router._def.subscriptions,
    ).filter((key) => this.has('subscriptions', prefix + key));

    const duplicates = [
      ...duplicateQueries,
      ...duplicateMutations,
      ...duplicateSubscriptions,
    ];
    if (duplicates.length) {
      throw new Error(`Duplicate endpoint(s): ${duplicates.join(', ')}`);
    }

    return new Router<TContext, any, any, any, any>({
      queries: {
        ...this._def.queries,
        ...this.inhertMiddlewares(
          Router.prefixRoutes(router._def.queries, prefix),
        ),
      },
      mutations: {
        ...this._def.mutations,
        ...this.inhertMiddlewares(
          Router.prefixRoutes(router._def.mutations, prefix),
        ),
      },
      subscriptions: {
        ...this._def.subscriptions,
        ...this.inhertMiddlewares(
          Router.prefixRoutes(router._def.subscriptions, prefix),
        ),
      },
      middlewares: this._def.middlewares,
    });
  }

  private inhertMiddlewares<TRoutes extends RouteRecord<TCtx>, TCtx>(
    routes: TRoutes,
  ): TRoutes {
    const newRoutes = {} as TRoutes;
    for (const key in routes) {
      const route = routes[key];
      newRoutes[key] = {
        ...route,
        _middlewares: [
          //
          ...this._def.middlewares,
          ...(route._middlewares ?? []),
        ],
      };
    }
    return newRoutes;
  }
  private static getInput<TRoute extends Route<any, any, any>>(
    route: TRoute,
    rawInput: unknown,
  ): inferRouteInput<TRoute> {
    if (!route.input) {
      return undefined as inferRouteInput<TRoute>;
    }

    try {
      const anyInput: any = route.input;
      if (typeof anyInput.parse === 'function') {
        return anyInput.parse(rawInput);
      }

      if (typeof anyInput === 'function') {
        return anyInput(rawInput);
      }
      if (typeof anyInput.validateSync === 'function') {
        return anyInput.validateSync(rawInput);
      }

      throw new Error('Could not find a validator fn');
    } catch (_err) {
      const err = new InputValidationError(_err);
      throw err;
    }
  }

  public async invoke(opts: {
    target: 'queries' | 'subscriptions' | 'mutations';
    ctx: TContext;
    path: string;
    input?: unknown;
  }): Promise<unknown> {
    if (!this.has(opts.target, opts.path)) {
      throw new RouteNotFoundError(`No such route "${opts.path}"`);
    }
    const target = this._def[opts.target];
    const route: Route<TContext> = target[opts.path as any];
    const { ctx } = opts;
    for (const fn of route._middlewares ?? []) {
      await fn({ ctx });
    }
    const input = Router.getInput(route, opts.input);

    return route.resolve({ ctx, input });
  }

  public has(what: 'subscriptions' | 'mutations' | 'queries', path: string) {
    return !!this._def[what][path];
  }

  /**
   * Function to be called before any route is invoked
   * Can be async or sync
   */
  middleware(fn: TMiddleware) {
    this._def.middlewares.push(fn);
    return this;
  }
}

export function router<TContext>() {
  return new Router<TContext, {}, {}, {}, MiddlewareFunction<TContext>>();
}
