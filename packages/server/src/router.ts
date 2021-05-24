/* eslint-disable @typescript-eslint/ban-types */
/* eslint-disable @typescript-eslint/no-explicit-any */

import { assertNotBrowser } from './assertNotBrowser';
import { notFoundError, TRPCError } from './errors';
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
import { flatten, Prefixer, ThenArg } from './types';
assertNotBrowser();

export type ProcedureType = 'query' | 'mutation' | 'subscription';
export type ProcedureRecord<TContext = any, TInput = any, TOutput = any> =
  Record<string, Procedure<TContext, TInput, TOutput>>;

export type inferProcedureInput<TProcedure extends Procedure<any, any, any>> =
  TProcedure extends ProcedureWithInput<any, infer Input, any>
    ? Input
    : undefined;

export type inferAsyncReturnType<TFunction extends (...args: any) => any> =
  ThenArg<ReturnType<TFunction>>;

export type inferProcedureOutput<TProcedure extends Procedure> =
  inferAsyncReturnType<TProcedure['call']>;

export type inferSubscriptionOutput<
  TRouter extends AnyRouter,
  TPath extends keyof TRouter['_def']['subscriptions'],
> = ReturnType<
  inferAsyncReturnType<
    TRouter['_def']['subscriptions'][TPath]['call']
  >['output']
>;

export type inferHandlerInput<TProcedure extends Procedure> =
  TProcedure extends ProcedureWithInput<any, infer TInput, any>
    ? undefined extends TInput
      ? [TInput?]
      : [TInput]
    : [undefined?];

type inferHandlerFn<TProcedures extends ProcedureRecord> = <
  TProcedure extends TProcedures[TPath],
  TPath extends keyof TProcedures & string,
>(
  path: TPath,
  ...args: inferHandlerInput<TProcedure>
) => Promise<inferProcedureOutput<TProcedures[TPath]>>;

export type inferRouterContext<TRouter extends AnyRouter> = Parameters<
  TRouter['createCaller']
>[0];

export type AnyRouter<TContext = any> = Router<TContext, any, any, any, any>;

const PROCEDURE_DEFINITION_MAP: Record<
  ProcedureType,
  'queries' | 'mutations' | 'subscriptions'
> = {
  query: 'queries',
  mutation: 'mutations',
  subscription: 'subscriptions',
};
export type ErrorFormatter<TContext, TOutput extends {}> = ({
  error,
}: {
  error: TRPCError;
  type: ProcedureType | 'unknown';
  path: string | undefined;
  input: unknown;
  ctx: undefined | TContext;
  defaultShape: DefaultErrorShape;
}) => TOutput;

export type ErrorShape = {};

export type DefaultErrorShape = {
  message: string;
  code: string;
  path?: string;
  stack?: string;
};

export type MiddlewareFunction<TContext> = (opts: {
  ctx: TContext;
  type: ProcedureType;
  path: string;
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
  TErrorShape extends ErrorShape,
> {
  readonly _def: Readonly<{
    queries: Readonly<TQueries>;
    mutations: Readonly<TMutations>;
    subscriptions: Readonly<TSubscriptions>;
    middlewares: MiddlewareFunction<TContext>[];
    errorFormatter: ErrorFormatter<TContext, TErrorShape>;
  }>;

  constructor(def?: {
    queries: TQueries;
    mutations: TMutations;
    subscriptions: TSubscriptions;
    middlewares: MiddlewareFunction<TContext>[];
    errorFormatter: ErrorFormatter<TContext, TErrorShape>;
  }) {
    this._def = def ?? {
      queries: {} as TQueries,
      mutations: {} as TMutations,
      subscriptions: {} as TSubscriptions,
      middlewares: [],
      errorFormatter: (({
        defaultShape,
      }: {
        defaultShape: DefaultErrorShape;
      }) => {
        return defaultShape;
      }) as any,
    };
  }

  private static prefixProcedures<
    TProcedures extends ProcedureRecord,
    TPrefix extends string,
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
    flatten<
      TQueries,
      Record<TPath, inferProcedureFromOptions<typeof procedure>>
    >,
    TMutations,
    TSubscriptions,
    TErrorShape
  >;
  public query<TPath extends string, TOutput>(
    path: TPath,
    procedure: CreateProcedureWithoutInput<TContext, TOutput>,
  ): Router<
    TContext,
    flatten<
      TQueries,
      Record<TPath, inferProcedureFromOptions<typeof procedure>>
    >,
    TMutations,
    TSubscriptions,
    TErrorShape
  >;
  public query<TPath extends string, TInput, TOutput>(
    path: TPath,
    procedure: CreateProcedureOptions<TContext, TInput, TOutput>,
  ) {
    const router = new Router<TContext, any, {}, {}, any>({
      queries: {
        [path]: createProcedure(procedure),
      },
      mutations: {},
      subscriptions: {},
      middlewares: [],
      errorFormatter: () => ({}),
    });

    return this.merge(router) as any;
  }

  public mutation<TPath extends string, TInput, TOutput>(
    path: TPath,
    procedure: CreateProcedureWithInput<TContext, TInput, TOutput>,
  ): Router<
    TContext,
    TQueries,
    flatten<
      TMutations,
      Record<TPath, inferProcedureFromOptions<typeof procedure>>
    >,
    TSubscriptions,
    TErrorShape
  >;
  public mutation<TPath extends string, TOutput>(
    path: TPath,
    procedure: CreateProcedureWithoutInput<TContext, TOutput>,
  ): Router<
    TContext,
    TQueries,
    flatten<
      TMutations,
      Record<TPath, inferProcedureFromOptions<typeof procedure>>
    >,
    TSubscriptions,
    TErrorShape
  >;
  public mutation<TPath extends string, TInput, TOutput>(
    path: TPath,
    procedure: CreateProcedureOptions<TContext, TInput, TOutput>,
  ) {
    const router = new Router<TContext, {}, any, {}, any>({
      queries: {},
      mutations: {
        [path]: createProcedure(procedure),
      },
      subscriptions: {},
      middlewares: [],
      errorFormatter: () => ({}),
    });

    return this.merge(router) as any;
  }
  /**
   * ⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️
   *  **Experimental.** API might change without major version bump
   * ⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠
   */
  public subscription<
    TPath extends string,
    TInput,
    TOutput extends Subscription<unknown>,
  >(
    path: TPath,
    procedure: CreateProcedureWithInput<TContext, TInput, TOutput>,
  ): Router<
    TContext,
    TQueries,
    TMutations,
    TSubscriptions & Record<TPath, inferProcedureFromOptions<typeof procedure>>,
    TErrorShape
  >;
  /**
   * ⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️
   *  **Experimental.** API might change without major version bump
   * ⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠
   */
  public subscription<
    TPath extends string,
    TOutput extends Subscription<unknown>,
  >(
    path: TPath,
    procedure: CreateProcedureWithoutInput<TContext, TOutput>,
  ): Router<
    TContext,
    TQueries,
    TMutations,
    TSubscriptions & Record<TPath, inferProcedureFromOptions<typeof procedure>>,
    TErrorShape
  >;
  public subscription<
    TPath extends string,
    TInput,
    TOutput extends Subscription<unknown>,
  >(path: TPath, procedure: CreateProcedureOptions<TContext, TInput, TOutput>) {
    const router = new Router<TContext, {}, {}, any, any>({
      queries: {},
      mutations: {},
      subscriptions: {
        [path]: createProcedure(procedure),
      },
      middlewares: [],
      errorFormatter: () => ({}),
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
    flatten<TSubscriptions, TChildRouter['_def']['subscriptions']>,
    TErrorShape
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
    >,
    TErrorShape
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

    const duplicateQueries = Object.keys(childRouter._def.queries).filter(
      (key) => !!this._def['queries'][prefix + key],
    );
    const duplicateMutations = Object.keys(childRouter._def.mutations).filter(
      (key) => !!this._def['mutations'][prefix + key],
    );
    const duplicateSubscriptions = Object.keys(
      childRouter._def.subscriptions,
    ).filter((key) => !!this._def['subscriptions'][prefix + key]);

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

    return new Router<TContext, any, any, any, TErrorShape>({
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
      errorFormatter: this._def.errorFormatter,
    });
  }

  /**
   * Invoke procedure. Only for internal use within library.
   */
  private async invoke({
    type,
    path,
    ctx,
    input,
  }: {
    type: ProcedureType;
    ctx: TContext;
    path: string;
    input?: unknown;
  }): Promise<unknown> {
    const defTarget = PROCEDURE_DEFINITION_MAP[type];
    const target = this._def[defTarget][path];

    if (!target) {
      throw notFoundError(`No such ${type} procedure "${path}"`);
    }
    const procedure: Procedure<TContext> = target;

    return procedure.call({ ctx, input, type, path });
  }

  public createCaller(ctx: TContext): {
    query: inferHandlerFn<TQueries>;
    mutation: inferHandlerFn<TMutations>;
    subscription: inferHandlerFn<TSubscriptions>;
  } {
    return {
      query: (path, ...args) => {
        return this.invoke({
          type: 'query',
          ctx,
          path,
          input: args[0],
        }) as any;
      },
      mutation: (path, ...args) => {
        return this.invoke({
          type: 'mutation',
          ctx,
          path,
          input: args[0],
        }) as any;
      },
      subscription: (path, ...args) => {
        return this.invoke({
          type: 'subscription',
          ctx,
          path,
          input: args[0],
        }) as any;
      },
    };
  }
  /**
   * Function to be called before any procedure is invoked
   * Can be async or sync
   */
  public middleware(middleware: MiddlewareFunction<TContext>) {
    return new Router<
      TContext,
      TQueries,
      TMutations,
      TSubscriptions,
      TErrorShape
    >({
      ...this._def,
      middlewares: [...this._def.middlewares, middleware],
    });
  }

  /**
   * Format errors
   */
  public formatError<TErrorFormatter extends ErrorFormatter<TContext, any>>(
    errorFormatter: TErrorFormatter,
  ) {
    return new Router<
      TContext,
      TQueries,
      TMutations,
      TSubscriptions,
      ReturnType<TErrorFormatter>
    >({
      ...this._def,
      errorFormatter,
    });
  }

  public getErrorShape(opts: {
    error: TRPCError;
    type: ProcedureType | 'unknown';
    path: string | undefined;
    input: unknown;
    ctx: undefined | TContext;
  }): TErrorShape {
    const defaultShape: DefaultErrorShape = {
      message: opts.error.message,
      code: opts.error.code,
      path: opts.path,
    };
    if (
      process.env.NODE_ENV !== 'production' &&
      typeof opts.error.stack === 'string'
    ) {
      defaultShape.stack = opts.error.stack;
    }
    return this._def.errorFormatter({ ...opts, defaultShape });
  }
}

export function router<TContext>() {
  return new Router<TContext, {}, {}, {}, DefaultErrorShape>();
}
