/* eslint-disable @typescript-eslint/ban-types */
/* eslint-disable @typescript-eslint/no-explicit-any */

import { assertNotBrowser } from './assertNotBrowser';
import { InputValidationError, RouteNotFoundError } from './errors';
import { Subscription } from './subscription';
import { format, Prefixer, ThenArg } from './types';
assertNotBrowser();

export type ProcedureInputParserZodEsque<TInput = unknown> = {
  parse: (input: any) => TInput;
};

export type ProcedureInputParserCustomValidatorEsque<TInput = unknown> = (
  input: unknown,
) => TInput;

export type ProcedureInputParserYupEsque<TInput = unknown> = {
  validateSync: (input: unknown) => TInput;
};
export type ProcedureInputParser<TInput = unknown> =
  | ProcedureInputParserZodEsque<TInput>
  | ProcedureInputParserYupEsque<TInput>
  | ProcedureInputParserCustomValidatorEsque<TInput>;

export type ProcedureResolver<
  TContext = unknown,
  TInput = unknown,
  TOutput = unknown
> = (opts: { ctx: TContext; input: TInput }) => Promise<TOutput> | TOutput;

export type ProcedureWithInput<
  TContext = unknown,
  TInput = unknown,
  TOutput = unknown
> = {
  input: ProcedureInputParser<TInput>;
  resolve: ProcedureResolver<TContext, TInput, TOutput>;
};

export type ProcedureWithoutInput<
  TContext = unknown,
  TInput = unknown,
  TOutput = unknown
> = {
  input?: undefined | null;
  resolve: ProcedureResolver<TContext, TInput, TOutput>;
};
export type Procedure<
  TContext = unknown,
  TInput = unknown,
  TOutput = unknown
> = (
  | ProcedureWithInput<TContext, TInput, TOutput>
  | ProcedureWithoutInput<TContext, TInput, TOutput>
) & {
  _middlewares?: MiddlewareFunction<TContext>[];
};

export type ProcedureRecord<
  TContext = unknown,
  TInput = unknown,
  TOutput = unknown
> = Record<string, Procedure<TContext, TInput, TOutput>>;

export type inferProcedureInput<
  TProcedure extends Procedure<any, any, any>
> = TProcedure extends ProcedureWithInput<any, infer Input, any>
  ? Input
  : never;

export type inferAsyncReturnType<
  TFunction extends (...args: any) => any
> = ThenArg<ReturnType<TFunction>>;

export type inferProcedureOutput<
  TProcedure extends Procedure
> = inferAsyncReturnType<TProcedure['resolve']>;
export type inferSubscriptionOutput<
  TRouter extends AnyRouter,
  TPath extends keyof TRouter['_def']['subscriptions']
> = ReturnType<
  inferAsyncReturnType<
    TRouter['_def']['subscriptions'][TPath]['resolve']
  >['output']
>;

export type inferHandlerInput<
  TProcedure extends Procedure
> = TProcedure extends ProcedureWithInput<any, any, any>
  ? [inferProcedureInput<TProcedure>]
  : [undefined?];

export type inferHandlerFn<
  TProcedures extends ProcedureRecord<any, any, any>
> = <
  TProcedure extends TProcedures[TPath],
  TPath extends keyof TProcedures & string
>(
  path: TPath,
  ...args: TProcedure extends ProcedureWithInput<any, any, any>
    ? [inferProcedureInput<TProcedure>]
    : [undefined?]
) => Promise<inferProcedureOutput<TProcedures[TPath]>>;

export type AnyRouter<TContext = any> = Router<TContext, any, any, any, any>;

export type MiddlewareFunction<TContext> = (opts: {
  ctx: TContext;
}) => Promise<void> | void;
export class Router<
  TContext,
  TQueries extends ProcedureRecord<TContext>,
  TMutations extends ProcedureRecord<TContext>,
  TSubscriptions extends ProcedureRecord<
    TContext,
    unknown,
    Subscription<unknown>
  >,
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

  private static prefixProcedures<
    TProcedures extends ProcedureRecord,
    TPrefix extends string
  >(procedures: TProcedures, prefix: TPrefix): Prefixer<TProcedures, TPrefix> {
    const eps: ProcedureRecord = {};
    for (const key in procedures) {
      eps[prefix + key] = procedures[key];
    }
    return eps as any;
  }

  public query<TPath extends string, TInput, TOutput>(
    path: TPath,
    route: Procedure<TContext, TInput, TOutput>,
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
  // public queries<TProcedures extends ProcedureRecord<TContext, any, any>>(
  //   procedures: TProcedures,
  // ): Router<TContext, TQueries & TProcedures, TMutations, TSubscriptions> {
  //   const router = new Router<TContext, any, {}, {}>({
  //     queries: procedures,
  //     mutations: {},
  //     subscriptions: {},
  //   });

  //   return this.merge(router) as any;
  // }

  public mutation<TPath extends string, TInput, TOutput>(
    path: TPath,
    route: Procedure<TContext, TInput, TOutput>,
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
    route: Procedure<TContext, TInput, TOutput>,
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
        ...this.inheritMiddlewares(
          Router.prefixProcedures(router._def.queries, prefix),
        ),
      },
      mutations: {
        ...this._def.mutations,
        ...this.inheritMiddlewares(
          Router.prefixProcedures(router._def.mutations, prefix),
        ),
      },
      subscriptions: {
        ...this._def.subscriptions,
        ...this.inheritMiddlewares(
          Router.prefixProcedures(router._def.subscriptions, prefix),
        ),
      },
      middlewares: this._def.middlewares,
    });
  }

  private inheritMiddlewares<TProcedures extends ProcedureRecord<TContext>>(
    procedures: TProcedures,
  ): TProcedures {
    const newProcedures = {} as TProcedures;
    for (const key in procedures) {
      const procedure = procedures[key];
      newProcedures[key] = {
        ...procedure,
        _middlewares: [
          ...this._def.middlewares,
          ...(procedure._middlewares ?? []),
        ],
      };
    }
    return newProcedures;
  }
  private static getInput<TProcedure extends Procedure<any, any, any>>(
    route: TProcedure,
    rawInput: unknown,
  ): inferProcedureInput<TProcedure> {
    if (!route.input) {
      return undefined as inferProcedureInput<TProcedure>;
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
      throw new RouteNotFoundError(`No such procedure "${opts.path}"`);
    }
    const target = this._def[opts.target];
    const route: Procedure<TContext> = target[opts.path as any];
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
   * Function to be called before any procedure is invoked
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
