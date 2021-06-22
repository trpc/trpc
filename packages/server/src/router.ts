/* eslint-disable @typescript-eslint/ban-types */
/* eslint-disable @typescript-eslint/no-explicit-any */

import { assertNotBrowser } from './assertNotBrowser';
import { TRPCError } from './errors';
import {
  createProcedure,
  CreateProcedureOptions,
  CreateProcedureWithInput,
  CreateProcedureWithoutInput,
  inferProcedureFromOptions,
  Procedure,
  ProcedureWithInput,
} from './procedure';
import {
  TRPCErrorShape,
  TRPC_ERROR_CODES_BY_KEY,
  TRPC_ERROR_CODE_KEY,
  TRPC_ERROR_CODE_NUMBER,
} from './rpc';
import { Subscription } from './subscription';
import { DataTransformer, DataTransformerOptions } from './transformer';
import { flatten, Prefixer, ThenArg } from './types';

assertNotBrowser();

export type ProcedureType = 'query' | 'mutation' | 'subscription';
export type ProcedureRecord<
  TContext = any,
  TInput = any,
  TOutput = any,
> = Record<string, Procedure<TContext, TInput, TOutput>>;

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

function getDataTransformer(
  transformer: DataTransformerOptions,
): DataTransformer {
  if ('input' in transformer) {
    return {
      deserialize: transformer.input.deserialize,
      serialize: transformer.output.serialize,
    };
  }
  return transformer;
}

export type inferHandlerInput<TProcedure extends Procedure> =
  TProcedure extends ProcedureWithInput<any, infer TInput, any>
    ? undefined extends TInput
      ? [(TInput | null | undefined)?]
      : [TInput]
    : [(undefined | null)?];

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

export type inferRouterError<TRouter extends AnyRouter> = ReturnType<
  TRouter['getErrorShape']
>;
const PROCEDURE_DEFINITION_MAP: Record<
  ProcedureType,
  'queries' | 'mutations' | 'subscriptions'
> = {
  query: 'queries',
  mutation: 'mutations',
  subscription: 'subscriptions',
};
export type ErrorFormatter<
  TContext,
  TOutput extends TRPCErrorShape<number, unknown>,
> = ({
  error,
}: {
  error: TRPCError;
  type: ProcedureType | 'unknown';
  path: string | undefined;
  input: unknown;
  ctx: undefined | TContext;
  shape: DefaultErrorShape;
}) => TOutput;

interface DefaultErrorData {
  code: TRPC_ERROR_CODE_KEY;
  path?: string;
  stack?: string;
}
export interface DefaultErrorShape
  extends TRPCErrorShape<TRPC_ERROR_CODE_NUMBER, DefaultErrorData> {
  message: string;
  code: TRPC_ERROR_CODE_NUMBER;
}

/**
 * Create an empty object with `Object.create(null)`.
 * Objects made from `Object.create(null)` are totally empty -- they do not inherit anything from Object.prototype.
 */
function safeObject(): {};

/**
 * Create an object without inheriting anything from `Object.prototype`
 */
function safeObject<TObj1>(obj: TObj1): TObj1;
/**
 * Merge two objects without inheritance from `Object.prototype`
 */
function safeObject<TObj1, TObj2>(
  obj1: TObj1,
  obj2: TObj2,
): flatten<TObj1, TObj2>;
function safeObject(...args: unknown[]) {
  return Object.assign(Object.create(null), ...args);
}
const defaultFormatter: ErrorFormatter<any, any> = ({
  shape,
}: {
  shape: DefaultErrorShape;
}) => {
  return shape;
};
const defaultTransformer: DataTransformer = {
  serialize: (obj) => obj,
  deserialize: (obj) => obj,
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
  TErrorShape extends TRPCErrorShape<number, unknown>,
> {
  readonly _def: Readonly<{
    queries: Readonly<TQueries>;
    mutations: Readonly<TMutations>;
    subscriptions: Readonly<TSubscriptions>;
    middlewares: MiddlewareFunction<TContext>[];
    errorFormatter: ErrorFormatter<TContext, TErrorShape>;
    transformer: DataTransformer;
  }>;

  constructor(def?: {
    queries?: TQueries;
    mutations?: TMutations;
    subscriptions?: TSubscriptions;
    middlewares?: MiddlewareFunction<TContext>[];
    errorFormatter?: ErrorFormatter<TContext, TErrorShape>;
    transformer?: DataTransformer;
  }) {
    this._def = {
      queries: (def?.queries ?? safeObject()) as TQueries,
      mutations: (def?.mutations ?? safeObject()) as TMutations,
      subscriptions: (def?.subscriptions ?? safeObject()) as TSubscriptions,
      middlewares: def?.middlewares ?? [],
      errorFormatter: def?.errorFormatter ?? defaultFormatter,
      transformer: def?.transformer ?? defaultTransformer,
    };
  }

  private static prefixProcedures<
    TProcedures extends ProcedureRecord,
    TPrefix extends string,
  >(procedures: TProcedures, prefix: TPrefix): Prefixer<TProcedures, TPrefix> {
    const eps: ProcedureRecord = safeObject();
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
      queries: safeObject({
        [path]: createProcedure(procedure),
      }),
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
      mutations: safeObject({
        [path]: createProcedure(procedure),
      }),
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
      subscriptions: safeObject({
        [path]: createProcedure(procedure),
      }),
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
    } /* istanbul ignore next */ else {
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
    /* istanbul ignore next */
    if (duplicates.length) {
      throw new Error(`Duplicate endpoint(s): ${duplicates.join(', ')}`);
    }

    const mergeProcedures = (defs: ProcedureRecord<any>) => {
      const newDefs = safeObject() as typeof defs;
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
      queries: safeObject(
        this._def.queries,
        mergeProcedures(childRouter._def.queries),
      ),
      mutations: safeObject(
        this._def.mutations,
        mergeProcedures(childRouter._def.mutations),
      ),
      subscriptions: safeObject(
        this._def.subscriptions,
        mergeProcedures(childRouter._def.subscriptions),
      ),
      middlewares: this._def.middlewares,
      errorFormatter: this._def.errorFormatter,
      transformer: this._def.transformer,
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
    const defs = this._def[defTarget];
    const procedure = defs[path] as Procedure<TContext> | undefined;

    if (!procedure) {
      throw new TRPCError({
        code: 'PATH_NOT_FOUND',
        message: `No "${type}"-procedure on path "${path}"`,
      });
    }

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
   * @link https://trpc.io/docs/middlewares
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
   * @link https://trpc.io/docs/error-formatting
   */
  public formatError<TErrorFormatter extends ErrorFormatter<TContext, any>>(
    errorFormatter: TErrorFormatter,
  ) {
    if (this._def.errorFormatter !== (defaultFormatter as any)) {
      throw new Error(
        'You seem to have double `formatError()`-calls in your router tree',
      );
    }
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
    const { path, error } = opts;
    const { code } = opts.error;
    const shape: DefaultErrorShape = {
      message: error.message,
      code: TRPC_ERROR_CODES_BY_KEY[code],
      data: {
        code,
      },
    };
    if (
      process.env.NODE_ENV !== 'production' &&
      typeof opts.error.stack === 'string'
    ) {
      shape.data.stack = opts.error.stack;
    }
    if (typeof path === 'string') {
      shape.data.path = path;
    }
    return this._def.errorFormatter({ ...opts, shape });
  }

  /**
   * Add data transformer to serialize/deserialize input args + output
   * @link https://trpc.io/docs/data-transformers
   */
  transformer(_transformer: DataTransformerOptions) {
    const transformer = getDataTransformer(_transformer);

    if (this._def.transformer !== defaultTransformer) {
      throw new Error(
        'You seem to have double `transformer()`-calls in your router tree',
      );
    }
    return new Router<
      TContext,
      TQueries,
      TMutations,
      TSubscriptions,
      TErrorShape
    >({
      ...this._def,
      transformer,
    });
  }
}

export function router<TContext>() {
  return new Router<TContext, {}, {}, {}, DefaultErrorShape>();
}
