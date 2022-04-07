/* eslint-disable @typescript-eslint/ban-types */

/* eslint-disable @typescript-eslint/no-explicit-any */
import { TRPCError } from './TRPCError';
import { assertNotBrowser } from './assertNotBrowser';
import { getHTTPStatusCodeFromError } from './http/internals/getHTTPStatusCode';
import { MiddlewareFunction } from './internals/middlewares';
import {
  CreateProcedureOptions,
  CreateProcedureWithInput,
  CreateProcedureWithInputOutputParser,
  CreateProcedureWithoutInput,
  Procedure,
  ProcedureCallOptions,
  createProcedure,
  inferProcedureFromOptions,
} from './internals/procedure';
import {
  TRPCErrorShape,
  TRPC_ERROR_CODES_BY_KEY,
  TRPC_ERROR_CODE_KEY,
  TRPC_ERROR_CODE_NUMBER,
} from './rpc';
import { Subscription } from './subscription';
import { CombinedDataTransformer, DataTransformerOptions } from './transformer';
import { Prefixer, ThenArg, flatten } from './types';

assertNotBrowser();

/**
 * @public
 */
export type ProcedureType = 'query' | 'mutation' | 'subscription';

/**
 * @internal
 */
export type ProcedureRecord<
  TInputContext = any,
  TContext = any,
  TMeta = any,
  TInput = any,
  TParsedInput = any,
  TOutput = any,
  TParsedOutput = any,
> = Record<
  string,
  Procedure<
    TInputContext,
    TContext,
    TMeta,
    TInput,
    TParsedInput,
    TOutput,
    TParsedOutput
  >
>;

/**
 * @public
 */
export type inferProcedureInput<
  TProcedure extends Procedure<any, any, any, any, any, any, any>,
> = TProcedure extends Procedure<any, any, any, infer Input, any, any, any>
  ? undefined extends Input
    ? Input | null | void // void is necessary to allow procedures with nullish input to be called without an input
    : Input
  : undefined;

/**
 * @public
 */
export type inferAsyncReturnType<TFunction extends (...args: any) => any> =
  ThenArg<ReturnType<TFunction>>;

/**
 * @public
 */
export type inferProcedureOutput<
  TProcedure extends Procedure<any, any, any, any, any, any, any>,
> = inferAsyncReturnType<TProcedure['call']>;

/**
 * @public
 * @beta
 */
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
): CombinedDataTransformer {
  if ('input' in transformer) {
    return transformer;
  }
  return { input: transformer, output: transformer };
}
/**
 * @internal
 */
export type inferHandlerInput<
  TProcedure extends Procedure<any, any, any, any, any, any, any>,
> = TProcedure extends Procedure<any, any, any, infer TInput, any, any, any>
  ? undefined extends TInput // ? is input optional
    ? unknown extends TInput // ? is input unset
      ? [(null | undefined)?] // -> there is no input
      : [(TInput | null | undefined)?] // -> there is optional input
    : [TInput] // -> input is required
  : [(undefined | null)?]; // -> there is no input

type inferHandlerFn<TProcedures extends ProcedureRecord> = <
  TProcedure extends TProcedures[TPath],
  TPath extends keyof TProcedures & string,
>(
  path: TPath,
  ...args: inferHandlerInput<TProcedure>
) => Promise<inferProcedureOutput<TProcedures[TPath]>>;

/**
 * @internal
 */
export type inferRouterContext<TRouter extends AnyRouter> = Parameters<
  TRouter['createCaller']
>[0];

/**
 * @internal
 */
export type inferRouterMeta<TRouter extends AnyRouter> = TRouter extends Router<
  any,
  any,
  infer TMeta,
  any,
  any,
  any,
  any
>
  ? TMeta
  : {};

/**
 * @public
 */
export type AnyRouter<TContext = any> = Router<
  any,
  TContext,
  any,
  any,
  any,
  any,
  any
>;

/**
 * @internal
 */
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

/**
 * @internal
 */
export type ErrorFormatter<TContext, TShape extends TRPCErrorShape<number>> = ({
  error,
}: {
  error: TRPCError;
  type: ProcedureType | 'unknown';
  path: string | undefined;
  input: unknown;
  ctx: undefined | TContext;
  shape: DefaultErrorShape;
}) => TShape;

type DefaultErrorData = {
  code: TRPC_ERROR_CODE_KEY;
  httpStatus: number;
  path?: string;
  stack?: string;
};

/**
 * @internal
 */
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
function safeObject<TObj1, TObj2>(obj1: TObj1, obj2: TObj2): TObj1 & TObj2;
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
const defaultTransformer: CombinedDataTransformer = {
  input: { serialize: (obj) => obj, deserialize: (obj) => obj },
  output: { serialize: (obj) => obj, deserialize: (obj) => obj },
};

type SwapProcedureContext<
  TProcedure extends Procedure<any, any, any, any, any, any, any>,
  TNewContext,
> = TProcedure extends Procedure<
  infer TInputContext,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  infer _TOldContext,
  infer TMeta,
  infer TInput,
  infer TParsedInput,
  infer TOutput,
  infer TParsedOutput
>
  ? Procedure<
      TInputContext,
      TNewContext,
      TMeta,
      TInput,
      TParsedInput,
      TOutput,
      TParsedOutput
    >
  : never;

type SwapContext<
  TObj extends ProcedureRecord<any, any, any, any, any, any>,
  TNewContext,
> = {
  [P in keyof TObj]: SwapProcedureContext<TObj[P], TNewContext>;
};

/**
 * @internal The type signature of this class may change without warning.
 */
export class Router<
  TInputContext,
  TContext,
  TMeta extends Record<string, any>,
  TQueries extends ProcedureRecord<
    TInputContext,
    TContext,
    any,
    any,
    any,
    any,
    any
  >,
  TMutations extends ProcedureRecord<
    TInputContext,
    TContext,
    any,
    any,
    any,
    any,
    any
  >,
  TSubscriptions extends ProcedureRecord<
    TInputContext,
    TContext,
    unknown,
    unknown,
    Subscription<unknown>,
    unknown,
    unknown
  >,
  TErrorShape extends TRPCErrorShape<number>,
> {
  readonly _def: {
    queries: TQueries;
    mutations: TMutations;
    subscriptions: TSubscriptions;
    middlewares: MiddlewareFunction<TInputContext, TContext, TMeta>[];
    errorFormatter: ErrorFormatter<TContext, TErrorShape>;
    transformer: CombinedDataTransformer;
  };

  constructor(def?: {
    queries?: TQueries;
    mutations?: TMutations;
    subscriptions?: TSubscriptions;
    middlewares?: MiddlewareFunction<TInputContext, TContext, TMeta>[];
    errorFormatter?: ErrorFormatter<TContext, TErrorShape>;
    transformer?: CombinedDataTransformer;
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

  public query<
    TPath extends string,
    TInput,
    TParsedInput,
    TOutput,
    TParsedOutput,
  >(
    path: TPath,
    procedure: CreateProcedureWithInputOutputParser<
      TContext,
      TMeta,
      TInput,
      TParsedInput,
      TOutput,
      TParsedOutput
    >,
  ): Router<
    TInputContext,
    TContext,
    TMeta,
    TQueries &
      Record<TPath, inferProcedureFromOptions<TInputContext, typeof procedure>>,
    TMutations,
    TSubscriptions,
    TErrorShape
  >;

  public query<TPath extends string, TInput, TOutput>(
    path: TPath,
    procedure: CreateProcedureWithInput<TContext, TMeta, TInput, TOutput>,
  ): Router<
    TInputContext,
    TContext,
    TMeta,
    TQueries &
      Record<TPath, inferProcedureFromOptions<TInputContext, typeof procedure>>,
    TMutations,
    TSubscriptions,
    TErrorShape
  >;

  public query<TPath extends string, TOutput, TParsedOutput>(
    path: TPath,
    procedure: CreateProcedureWithoutInput<
      TContext,
      TMeta,
      TOutput,
      TParsedOutput
    >,
  ): Router<
    TInputContext,
    TContext,
    TMeta,
    TQueries &
      Record<TPath, inferProcedureFromOptions<TInputContext, typeof procedure>>,
    TMutations,
    TSubscriptions,
    TErrorShape
  >;

  query(
    path: string,
    procedure: CreateProcedureOptions<TContext, TMeta, any, any, any, any>,
  ) {
    const router = new Router<TContext, TContext, TMeta, any, {}, {}, any>({
      queries: safeObject({
        [path]: createProcedure(procedure),
      }),
    });

    return this.merge(router);
  }

  public mutation<
    TPath extends string,
    TInput,
    TParsedInput,
    TOutput,
    TParsedOutput,
  >(
    path: TPath,
    procedure: CreateProcedureWithInputOutputParser<
      TContext,
      TMeta,
      TInput,
      TParsedInput,
      TOutput,
      TParsedOutput
    >,
  ): Router<
    TInputContext,
    TContext,
    TMeta,
    TQueries,
    TMutations &
      Record<TPath, inferProcedureFromOptions<TInputContext, typeof procedure>>,
    TSubscriptions,
    TErrorShape
  >;

  public mutation<TPath extends string, TInput, TOutput>(
    path: TPath,
    procedure: CreateProcedureWithInput<TContext, TMeta, TInput, TOutput>,
  ): Router<
    TInputContext,
    TContext,
    TMeta,
    TQueries,
    TMutations &
      Record<TPath, inferProcedureFromOptions<TInputContext, typeof procedure>>,
    TSubscriptions,
    TErrorShape
  >;

  public mutation<TPath extends string, TOutput, TParsedOutput>(
    path: TPath,
    procedure: CreateProcedureWithoutInput<
      TContext,
      TMeta,
      TOutput,
      TParsedOutput
    >,
  ): Router<
    TInputContext,
    TContext,
    TMeta,
    TQueries,
    TMutations &
      Record<TPath, inferProcedureFromOptions<TInputContext, typeof procedure>>,
    TSubscriptions,
    TErrorShape
  >;

  public mutation(
    path: string,
    procedure: CreateProcedureOptions<TContext, TMeta, any, any, any, any>,
  ) {
    const router = new Router<TContext, TContext, TMeta, {}, any, {}, any>({
      mutations: safeObject({
        [path]: createProcedure(procedure),
      }),
    });

    return this.merge(router);
  }

  /**
   * @beta Might change without a major version bump
   */
  public subscription<
    TPath extends string,
    TInput,
    TParsedInput,
    TOutput extends Subscription<unknown>,
  >(
    path: TPath,
    procedure: Omit<
      CreateProcedureWithInputOutputParser<
        TContext,
        TMeta,
        TInput,
        TParsedInput,
        TOutput,
        unknown
      >,
      'output'
    >,
  ): Router<
    TInputContext,
    TContext,
    TMeta,
    TQueries,
    TMutations,
    TSubscriptions &
      Record<TPath, inferProcedureFromOptions<TInputContext, typeof procedure>>,
    TErrorShape
  >;

  /**
   * @beta Might change without a major version bump
   */
  public subscription<
    TPath extends string,
    TInput,
    TOutput extends Subscription<unknown>,
  >(
    path: TPath,
    procedure: Omit<
      CreateProcedureWithInput<TContext, TMeta, TInput, TOutput>,
      'output'
    >,
  ): Router<
    TInputContext,
    TContext,
    TMeta,
    TQueries,
    TMutations,
    TSubscriptions &
      Record<TPath, inferProcedureFromOptions<TInputContext, typeof procedure>>,
    TErrorShape
  >;

  /**
   * @beta Might change without a major version bump
   */
  public subscription<
    TPath extends string,
    TOutput extends Subscription<unknown>,
  >(
    path: TPath,
    procedure: Omit<
      CreateProcedureWithoutInput<TContext, TMeta, TOutput, unknown>,
      'output'
    >,
  ): Router<
    TInputContext,
    TContext,
    TMeta,
    TQueries,
    TMutations,
    TSubscriptions &
      Record<TPath, inferProcedureFromOptions<TInputContext, typeof procedure>>,
    TErrorShape
  >;

  public subscription(
    path: string,
    procedure: Omit<
      CreateProcedureOptions<TContext, TMeta, any, any, any, any>,
      'output'
    >,
  ) {
    const router = new Router<TContext, TContext, TMeta, {}, {}, any, any>({
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
  public merge<
    TChildRouter extends Router<TContext, any, TMeta, any, any, any, any>,
  >(
    router: TChildRouter,
  ): Router<
    TInputContext,
    inferRouterContext<TChildRouter>,
    TMeta,
    TQueries & TChildRouter['_def']['queries'],
    TMutations & TChildRouter['_def']['mutations'],
    TSubscriptions & TChildRouter['_def']['subscriptions'],
    TErrorShape
  >;

  /**
   * Merge router with other router
   * @param prefix Prefix that this router should live under
   * @param router
   */
  public merge<
    TPath extends string,
    TChildRouter extends Router<TContext, any, TMeta, any, any, any, any>,
  >(
    prefix: TPath,
    router: TChildRouter,
  ): Router<
    TInputContext,
    inferRouterContext<TChildRouter>,
    TMeta,
    TQueries & Prefixer<TChildRouter['_def']['queries'], `${TPath}`>,
    TMutations & Prefixer<TChildRouter['_def']['mutations'], `${TPath}`>,
    TSubscriptions &
      Prefixer<TChildRouter['_def']['subscriptions'], `${TPath}`>,
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
    if (duplicates.length) {
      throw new Error(`Duplicate endpoint(s): ${duplicates.join(', ')}`);
    }

    const mergeProcedures = (defs: ProcedureRecord) => {
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

    return new Router<TInputContext, any, TMeta, any, any, any, TErrorShape>({
      ...this._def,
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
    });
  }

  /**
   * Invoke procedure. Only for internal use within library.
   */
  private async call(
    opts: ProcedureCallOptions<TInputContext>,
  ): Promise<unknown> {
    const { type, path } = opts;
    const defTarget = PROCEDURE_DEFINITION_MAP[type];
    const defs = this._def[defTarget];
    const procedure = defs[path] as
      | Procedure<TInputContext, TContext, TMeta, any, any, any, any>
      | undefined;

    if (!procedure) {
      throw new TRPCError({
        code: 'NOT_FOUND',
        message: `No "${type}"-procedure on path "${path}"`,
      });
    }

    return procedure.call(opts);
  }

  public createCaller(ctx: TInputContext): {
    query: inferHandlerFn<TQueries>;
    mutation: inferHandlerFn<TMutations>;
    subscription: inferHandlerFn<TSubscriptions>;
  } {
    return {
      query: (path, ...args) => {
        return this.call({
          type: 'query',
          ctx,
          path,
          rawInput: args[0],
        }) as any;
      },
      mutation: (path, ...args) => {
        return this.call({
          type: 'mutation',
          ctx,
          path,
          rawInput: args[0],
        }) as any;
      },
      subscription: (path, ...args) => {
        return this.call({
          type: 'subscription',
          ctx,
          path,
          rawInput: args[0],
        }) as any;
      },
    };
  }

  /**
   * Function to be called before any procedure is invoked
   * @link https://trpc.io/docs/middlewares
   */
  public middleware<TNewContext>(
    middleware: MiddlewareFunction<TContext, TNewContext, TMeta>,
  ): Router<
    TInputContext,
    TNewContext,
    TMeta,
    SwapContext<TQueries, TNewContext>,
    SwapContext<TMutations, TNewContext>,
    SwapContext<TSubscriptions, TNewContext>,
    TErrorShape
  > {
    return new Router({
      ...this._def,
      middlewares: [...this._def.middlewares, middleware as any],
    } as any);
  }

  /**
   * Format errors
   * @link https://trpc.io/docs/error-formatting
   */
  public formatError<
    TErrorFormatter extends ErrorFormatter<TContext, TRPCErrorShape<number>>,
  >(errorFormatter: TErrorFormatter) {
    if (this._def.errorFormatter !== (defaultFormatter as any)) {
      throw new Error(
        'You seem to have double `formatError()`-calls in your router tree',
      );
    }
    return new Router<
      TInputContext,
      TContext,
      TMeta,
      TQueries,
      TMutations,
      TSubscriptions,
      ReturnType<TErrorFormatter>
    >({
      ...this._def,
      errorFormatter: errorFormatter as any,
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
        httpStatus: getHTTPStatusCodeFromError(error),
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
      TInputContext,
      TContext,
      TMeta,
      TQueries,
      TMutations,
      TSubscriptions,
      TErrorShape
    >({
      ...this._def,
      transformer,
    });
  }

  /**
   * Flattens the generics of TQueries/TMutations/TSubscriptions.
   * ⚠️ Experimental - might disappear. ⚠️
   *
   * @alpha
   */
  public flat(): Router<
    TInputContext,
    TContext,
    TMeta,
    flatten<{}, TQueries>,
    flatten<{}, TMutations>,
    flatten<{}, TSubscriptions>,
    TErrorShape
  > {
    return this as any;
  }
}

/**
 * Subclass of `VNextRouter` with `TInputContext` and `TContext` set to the same type, for backcompat.
 *
 * @deprecated
 */
export class LegacyRouter<
  TContext,
  TMeta extends Record<string, any>,
  TQueries extends ProcedureRecord<TContext, TContext, any, any, any, any>,
  TMutations extends ProcedureRecord<TContext, TContext, any, any, any, any>,
  TSubscriptions extends ProcedureRecord<
    TContext,
    TContext,
    unknown,
    unknown,
    Subscription<unknown>,
    unknown
  >,
  TErrorShape extends TRPCErrorShape<number>,
> extends Router<
  TContext,
  TContext,
  TMeta,
  TQueries,
  TMutations,
  TSubscriptions,
  TErrorShape
> {}

export function router<TContext, TMeta extends Record<string, any> = {}>() {
  return new Router<TContext, TContext, TMeta, {}, {}, {}, DefaultErrorShape>();
}
