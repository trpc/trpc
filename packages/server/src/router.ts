/* eslint-disable @typescript-eslint/ban-types */
/* eslint-disable @typescript-eslint/no-explicit-any */

import { assertNotBrowser } from './assertNotBrowser';
import { RouteNotFoundError } from './errors';
import {
  createProcedure,
  CreateProcedureOptions,
  CreateProcedureWithInput,
  CreateProcedureWithoutInput,
  inferProcedureFromOptions,
  Procedure,
  ProcedureWithInput,
} from './procedure';
import { Subscription } from './subscription';
import { format, Prefixer, ThenArg } from './types';
assertNotBrowser();

export type ProcedureRecord<
  TContext = unknown,
  TInput = unknown,
  TOutput = unknown
> = Record<string, Procedure<TContext, TInput, TOutput>>;

export type inferProcedureInput<
  TProcedure extends Procedure<any, any, any>
> = TProcedure extends ProcedureWithInput<any, infer Input, any>
  ? Input
  : undefined;

export type inferAsyncReturnType<
  TFunction extends (...args: any) => any
> = ThenArg<ReturnType<TFunction>>;

export type inferProcedureOutput<
  TProcedure extends Procedure
> = inferAsyncReturnType<TProcedure['call']>;

export type inferSubscriptionOutput<
  TRouter extends AnyRouter,
  TPath extends keyof TRouter['_def']['subscriptions']
> = ReturnType<
  inferAsyncReturnType<
    TRouter['_def']['subscriptions'][TPath]['call']
  >['output']
>;

export type inferHandlerInput<
  TProcedure extends Procedure<any, any, any>
> = TProcedure extends ProcedureWithInput<any, infer TInput, any>
  ? undefined extends TInput
    ? [TInput?]
    : [TInput]
  : [undefined?];

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
    procedure: CreateProcedureWithInput<TContext, TInput, TOutput>,
  ): Router<
    TContext,
    TQueries & Record<TPath, inferProcedureFromOptions<typeof procedure>>,
    TMutations,
    TSubscriptions,
    TMiddleware
  >;
  public query<TPath extends string, TOutput>(
    path: TPath,
    procedure: CreateProcedureWithoutInput<TContext, TOutput>,
  ): Router<
    TContext,
    TQueries & Record<TPath, inferProcedureFromOptions<typeof procedure>>,
    TMutations,
    TSubscriptions,
    TMiddleware
  >;
  public query<TPath extends string, TInput, TOutput>(
    path: TPath,
    procedure: CreateProcedureOptions<TContext, TInput, TOutput>,
  ) {
    const router = new Router<TContext, any, {}, {}, any>({
      queries: {
        [path]: createProcedure(procedure),
      } as any,
      mutations: {},
      subscriptions: {},
      middlewares: [],
    }) as AnyRouter;

    return this.merge(router);
  }

  public mutation<TPath extends string, TInput, TOutput>(
    path: TPath,
    procedure: CreateProcedureWithInput<TContext, TInput, TOutput>,
  ): Router<
    TContext,
    TQueries,
    TMutations & Record<TPath, inferProcedureFromOptions<typeof procedure>>,
    TSubscriptions,
    TMiddleware
  >;
  public mutation<TPath extends string, TOutput>(
    path: TPath,
    procedure: CreateProcedureWithoutInput<TContext, TOutput>,
  ): Router<
    TContext,
    TQueries,
    TMutations & Record<TPath, inferProcedureFromOptions<typeof procedure>>,
    TSubscriptions,
    TMiddleware
  >;
  public mutation<TPath extends string, TInput, TOutput>(
    path: TPath,
    procedure: CreateProcedureOptions<TContext, TInput, TOutput>,
  ) {
    const router = new Router<TContext, any, {}, {}, any>({
      queries: {},
      mutations: {
        [path]: createProcedure(procedure),
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
    TOutput extends Subscription<unknown>
  >(
    path: TPath,
    procedure: CreateProcedureWithInput<TContext, TInput, TOutput>,
  ): Router<
    TContext,
    TQueries,
    TMutations,
    TSubscriptions & Record<TPath, inferProcedureFromOptions<typeof procedure>>,
    TMiddleware
  >;
  /**
   * ⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️
   *  **Experimental.** API might change without major version bump
   * ⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠
   */
  public subscription<
    TPath extends string,
    TOutput extends Subscription<unknown>
  >(
    path: TPath,
    procedure: CreateProcedureWithoutInput<TContext, TOutput>,
  ): Router<
    TContext,
    TQueries,
    TMutations,
    TSubscriptions & Record<TPath, inferProcedureFromOptions<typeof procedure>>,
    TMiddleware
  >;
  public subscription<
    TPath extends string,
    TInput,
    TOutput extends Subscription<unknown>
  >(path: TPath, procedure: CreateProcedureOptions<TContext, TInput, TOutput>) {
    const router = new Router<TContext, any, {}, {}, any>({
      queries: {},
      mutations: {},
      subscriptions: {
        [path]: createProcedure(procedure),
      },
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
    let childRouter: AnyRouter;

    if (typeof prefixOrRouter === 'string' && maybeRouter instanceof Router) {
      prefix = prefixOrRouter;
      childRouter = maybeRouter;
    } else if (prefixOrRouter instanceof Router) {
      childRouter = prefixOrRouter;
    } else {
      throw new Error('Invalid args');
    }

    const duplicateQueries = Object.keys(
      childRouter._def.queries,
    ).filter((key) => this.has('queries', prefix + key));
    const duplicateMutations = Object.keys(
      childRouter._def.mutations,
    ).filter((key) => this.has('mutations', prefix + key));
    const duplicateSubscriptions = Object.keys(
      childRouter._def.subscriptions,
    ).filter((key) => this.has('subscriptions', prefix + key));

    const duplicates = [
      ...duplicateQueries,
      ...duplicateMutations,
      ...duplicateSubscriptions,
    ];
    if (duplicates.length) {
      throw new Error(`Duplicate endpoint(s): ${duplicates.join(', ')}`);
    }

    const mergeProcedures = (defs: ProcedureRecord<any>) => {
      const newDefs = {} as typeof defs;
      for (const key in defs) {
        const procedure = defs[key];
        const newProcedure = procedure.inheritMiddlewares(
          this._def.middlewares,
        );
        newDefs[key] = newProcedure;
      }

      return Router.prefixProcedures(newDefs, prefix);
    };

    return new Router<TContext, any, any, any, any>({
      queries: {
        ...this._def.queries,
        ...mergeProcedures(childRouter._def.queries),
      },
      mutations: {
        ...this._def.mutations,
        ...mergeProcedures(childRouter._def.mutations),
      },
      subscriptions: {
        ...this._def.subscriptions,
        ...mergeProcedures(childRouter._def.subscriptions),
      },
      middlewares: this._def.middlewares,
    });
  }

  /**
   * Invoke procedure. Only for internal use within library.
   *
   * @throws RouteNotFoundError
   * @throws InputValidationError
   */
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
    const procedure: Procedure<TContext> = target[opts.path as any];
    const { ctx, input } = opts;

    return procedure.call({ ctx, input });
  }

  private has(what: 'subscriptions' | 'mutations' | 'queries', path: string) {
    return !!this._def[what][path];
  }

  /**
   * Function to be called before any procedure is invoked
   * Can be async or sync
   */
  public middleware(fn: TMiddleware) {
    this._def.middlewares.push(fn);
    return this;
  }
}

export function router<TContext>() {
  return new Router<TContext, {}, {}, {}, MiddlewareFunction<TContext>>();
}
