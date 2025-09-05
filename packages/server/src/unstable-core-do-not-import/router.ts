import type { Observable } from '../observable';
import { createRecursiveProxy } from './createProxy';
import { defaultFormatter } from './error/formatter';
import { getTRPCErrorFromUnknown, TRPCError } from './error/TRPCError';
import type {
  AnyProcedure,
  ErrorHandlerOptions,
  inferProcedureInput,
  inferProcedureOutput,
  LegacyObservableSubscriptionProcedure,
} from './procedure';
import type { ProcedureCallOptions } from './procedureBuilder';
import type { AnyRootTypes, RootConfig } from './rootConfig';
import { defaultTransformer } from './transformer';
import type { MaybePromise, ValueOf } from './types';
import {
  isFunction,
  isObject,
  mergeWithoutOverrides,
  omitPrototype,
} from './utils';

export interface RouterRecord {
  [key: string]: AnyProcedure | RouterRecord;
}

type DecorateProcedure<TProcedure extends AnyProcedure> = (
  input: inferProcedureInput<TProcedure>,
) => Promise<
  TProcedure['_def']['type'] extends 'subscription'
    ? TProcedure extends LegacyObservableSubscriptionProcedure<any>
      ? Observable<inferProcedureOutput<TProcedure>, TRPCError>
      : inferProcedureOutput<TProcedure>
    : inferProcedureOutput<TProcedure>
>;

/**
 * @internal
 */
export type DecorateRouterRecord<TRecord extends RouterRecord> = {
  [TKey in keyof TRecord]: TRecord[TKey] extends infer $Value
    ? $Value extends AnyProcedure
      ? DecorateProcedure<$Value>
      : $Value extends RouterRecord
        ? DecorateRouterRecord<$Value>
        : never
    : never;
};

/**
 * @internal
 */

export type RouterCallerErrorHandler<TContext> = (
  opts: ErrorHandlerOptions<TContext>,
) => void;

/**
 * @internal
 */
export type RouterCaller<
  TRoot extends AnyRootTypes,
  TRecord extends RouterRecord,
> = (
  /**
   * @note
   * If passing a function, we recommend it's a cached function
   * e.g. wrapped in `React.cache` to avoid unnecessary computations
   */
  ctx: TRoot['ctx'] | (() => MaybePromise<TRoot['ctx']>),
  options?: {
    onError?: RouterCallerErrorHandler<TRoot['ctx']>;
    signal?: AbortSignal;
  },
) => DecorateRouterRecord<TRecord>;

/**
 * @internal
 */
const lazyMarker = 'lazyMarker' as 'lazyMarker' & {
  __brand: 'lazyMarker';
};
export type Lazy<TAny> = (() => Promise<TAny>) & { [lazyMarker]: true };

type LazyLoader<TAny> = {
  load: () => Promise<void>;
  ref: Lazy<TAny>;
};

function once<T>(fn: () => T): () => T {
  const uncalled = Symbol();
  let result: T | typeof uncalled = uncalled;
  return (): T => {
    if (result === uncalled) {
      result = fn();
    }
    return result;
  };
}

/**
 * Lazy load a router
 * @see https://trpc.io/docs/server/merging-routers#lazy-load
 */
export function lazy<TRouter extends AnyRouter>(
  importRouter: () => Promise<
    | TRouter
    | {
        [key: string]: TRouter;
      }
  >,
): Lazy<NoInfer<TRouter>> {
  async function resolve(): Promise<TRouter> {
    const mod = await importRouter();

    // if the module is a router, return it
    if (isRouter(mod)) {
      return mod;
    }

    const routers = Object.values(mod);

    if (routers.length !== 1 || !isRouter(routers[0])) {
      throw new Error(
        "Invalid router module - either define exactly 1 export or return the router directly.\nExample: `lazy(() => import('./slow.js').then((m) => m.slowRouter))`",
      );
    }

    return routers[0];
  }

  (resolve as Lazy<NoInfer<TRouter>>)[lazyMarker] = true as const;

  return resolve as Lazy<NoInfer<TRouter>>;
}

function isLazy<TAny>(input: unknown): input is Lazy<TAny> {
  return typeof input === 'function' && lazyMarker in input;
}

/**
 * @internal
 */
export interface RouterDef<
  TRoot extends AnyRootTypes,
  TRecord extends RouterRecord,
> {
  _config: RootConfig<TRoot>;
  router: true;
  procedure?: never;
  procedures: TRecord;
  record: TRecord;
  lazy: Record<string, LazyLoader<AnyRouter>>;
}

export interface Router<
  TRoot extends AnyRootTypes,
  TRecord extends RouterRecord,
> {
  _def: RouterDef<TRoot, TRecord>;
  /**
   * @see https://trpc.io/docs/v11/server/server-side-calls
   */
  createCaller: RouterCaller<TRoot, TRecord>;
}

export type BuiltRouter<
  TRoot extends AnyRootTypes,
  TRecord extends RouterRecord,
> = Router<TRoot, TRecord> & TRecord;

export interface RouterBuilder<TRoot extends AnyRootTypes> {
  <TIn extends CreateRouterOptions>(
    _: TIn,
  ): BuiltRouter<TRoot, DecorateCreateRouterOptions<TIn>>;
}

export type AnyRouter = Router<any, any>;

export type inferRouterRootTypes<TRouter extends AnyRouter> =
  TRouter['_def']['_config']['$types'];

export type inferRouterContext<TRouter extends AnyRouter> =
  inferRouterRootTypes<TRouter>['ctx'];
export type inferRouterError<TRouter extends AnyRouter> =
  inferRouterRootTypes<TRouter>['errorShape'];
export type inferRouterMeta<TRouter extends AnyRouter> =
  inferRouterRootTypes<TRouter>['meta'];

function isRouter(value: unknown): value is AnyRouter {
  return (
    isObject(value) && isObject(value['_def']) && 'router' in value['_def']
  );
}

const emptyRouter = {
  _ctx: null as any,
  _errorShape: null as any,
  _meta: null as any,
  queries: {},
  mutations: {},
  subscriptions: {},
  errorFormatter: defaultFormatter,
  transformer: defaultTransformer,
};

/**
 * Reserved words that can't be used as router or procedure names
 */
const reservedWords = [
  /**
   * Then is a reserved word because otherwise we can't return a promise that returns a Proxy
   * since JS will think that `.then` is something that exists
   */
  'then',
  /**
   * `fn.call()` and `fn.apply()` are reserved words because otherwise we can't call a function using `.call` or `.apply`
   */
  'call',
  'apply',
];

/** @internal */
export type CreateRouterOptions = {
  [key: string]:
    | AnyProcedure
    | AnyRouter
    | CreateRouterOptions
    | Lazy<AnyRouter>;
};

/** @internal */
export type DecorateCreateRouterOptions<
  TRouterOptions extends CreateRouterOptions,
> = {
  [K in keyof TRouterOptions]: TRouterOptions[K] extends infer $Value
    ? $Value extends AnyProcedure
      ? $Value
      : $Value extends Router<any, infer TRecord>
        ? TRecord
        : $Value extends Lazy<Router<any, infer TRecord>>
          ? TRecord
          : $Value extends CreateRouterOptions
            ? DecorateCreateRouterOptions<$Value>
            : never
    : never;
};

/**
 * @internal
 */
export function createRouterFactory<TRoot extends AnyRootTypes>(
  config: RootConfig<TRoot>,
) {
  function createRouterInner<TInput extends CreateRouterOptions>(
    input: TInput,
  ): BuiltRouter<TRoot, DecorateCreateRouterOptions<TInput>> {
    const reservedWordsUsed = new Set(
      Object.keys(input).filter((v) => reservedWords.includes(v)),
    );
    if (reservedWordsUsed.size > 0) {
      throw new Error(
        'Reserved words used in `router({})` call: ' +
          Array.from(reservedWordsUsed).join(', '),
      );
    }

    const procedures: Record<string, AnyProcedure> = omitPrototype({});
    const lazy: Record<string, LazyLoader<AnyRouter>> = omitPrototype({});

    function createLazyLoader(opts: {
      ref: Lazy<AnyRouter>;
      path: readonly string[];
      key: string;
      aggregate: RouterRecord;
    }): LazyLoader<AnyRouter> {
      return {
        ref: opts.ref,
        load: once(async () => {
          const router = await opts.ref();
          const lazyPath = [...opts.path, opts.key];
          const lazyKey = lazyPath.join('.');

          opts.aggregate[opts.key] = step(router._def.record, lazyPath);

          delete lazy[lazyKey];

          // add lazy loaders for nested routers
          for (const [nestedKey, nestedItem] of Object.entries(
            router._def.lazy,
          )) {
            const nestedRouterKey = [...lazyPath, nestedKey].join('.');

            // console.log('adding lazy', nestedRouterKey);
            lazy[nestedRouterKey] = createLazyLoader({
              ref: nestedItem.ref,
              path: lazyPath,
              key: nestedKey,
              aggregate: opts.aggregate[opts.key] as RouterRecord,
            });
          }
        }),
      };
    }

    function step(from: CreateRouterOptions, path: readonly string[] = []) {
      const aggregate: RouterRecord = omitPrototype({});
      for (const [key, item] of Object.entries(from ?? {})) {
        if (isLazy(item)) {
          lazy[[...path, key].join('.')] = createLazyLoader({
            path,
            ref: item,
            key,
            aggregate,
          });
          continue;
        }
        if (isRouter(item)) {
          aggregate[key] = step(item._def.record, [...path, key]);
          continue;
        }
        if (!isProcedure(item)) {
          // RouterRecord
          aggregate[key] = step(item, [...path, key]);
          continue;
        }

        const newPath = [...path, key].join('.');

        if (procedures[newPath]) {
          throw new Error(`Duplicate key: ${newPath}`);
        }

        procedures[newPath] = item;
        aggregate[key] = item;
      }

      return aggregate;
    }
    const record = step(input);

    const _def: AnyRouter['_def'] = {
      _config: config,
      router: true,
      procedures,
      lazy,
      ...emptyRouter,
      record,
    };

    const router: BuiltRouter<TRoot, {}> = {
      ...(record as {}),
      _def,
      createCaller: createCallerFactory<TRoot>()({
        _def,
      }),
    };
    return router as BuiltRouter<TRoot, DecorateCreateRouterOptions<TInput>>;
  }

  return createRouterInner;
}

function isProcedure(
  procedureOrRouter: ValueOf<CreateRouterOptions>,
): procedureOrRouter is AnyProcedure {
  return typeof procedureOrRouter === 'function';
}

/**
 * @internal
 */
export async function getProcedureAtPath(
  router: Pick<Router<any, any>, '_def'>,
  path: string,
): Promise<AnyProcedure | null> {
  const { _def } = router;
  let procedure = _def.procedures[path];

  while (!procedure) {
    const key = Object.keys(_def.lazy).find((key) => path.startsWith(key));
    // console.log(`found lazy: ${key ?? 'NOPE'} (fullPath: ${fullPath})`);

    if (!key) {
      return null;
    }
    // console.log('loading', key, '.......');
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    const lazyRouter = _def.lazy[key]!;
    await lazyRouter.load();

    procedure = _def.procedures[path];
  }

  return procedure;
}

/**
 * @internal
 */
export async function callProcedure(
  opts: ProcedureCallOptions<unknown> & {
    router: AnyRouter;
    allowMethodOverride?: boolean;
  },
) {
  const { type, path } = opts;
  const proc = await getProcedureAtPath(opts.router, path);
  if (
    !proc ||
    !isProcedure(proc) ||
    (proc._def.type !== type && !opts.allowMethodOverride)
  ) {
    throw new TRPCError({
      code: 'NOT_FOUND',
      message: `No "${type}"-procedure on path "${path}"`,
    });
  }

  /* istanbul ignore if -- @preserve */
  if (
    proc._def.type !== type &&
    opts.allowMethodOverride &&
    proc._def.type === 'subscription'
  ) {
    throw new TRPCError({
      code: 'METHOD_NOT_SUPPORTED',
      message: `Method override is not supported for subscriptions`,
    });
  }

  return proc(opts);
}

export interface RouterCallerFactory<TRoot extends AnyRootTypes> {
  <TRecord extends RouterRecord>(
    router: Pick<Router<TRoot, TRecord>, '_def'>,
  ): RouterCaller<TRoot, TRecord>;
}

export function createCallerFactory<
  TRoot extends AnyRootTypes,
>(): RouterCallerFactory<TRoot> {
  return function createCallerInner<TRecord extends RouterRecord>(
    router: Pick<Router<TRoot, TRecord>, '_def'>,
  ): RouterCaller<TRoot, TRecord> {
    const { _def } = router;
    type Context = TRoot['ctx'];

    return function createCaller(ctxOrCallback, opts) {
      return createRecursiveProxy<ReturnType<RouterCaller<any, any>>>(
        async (innerOpts) => {
          const { path, args } = innerOpts;
          const fullPath = path.join('.');

          if (path.length === 1 && path[0] === '_def') {
            return _def;
          }

          const procedure = await getProcedureAtPath(router, fullPath);

          let ctx: Context | undefined = undefined;
          try {
            if (!procedure) {
              throw new TRPCError({
                code: 'NOT_FOUND',
                message: `No procedure found on path "${path}"`,
              });
            }
            ctx = isFunction(ctxOrCallback)
              ? await Promise.resolve(ctxOrCallback())
              : ctxOrCallback;

            return await procedure({
              path: fullPath,
              getRawInput: async () => args[0],
              ctx,
              type: procedure._def.type,
              signal: opts?.signal,
            });
          } catch (cause) {
            opts?.onError?.({
              ctx,
              error: getTRPCErrorFromUnknown(cause),
              input: args[0],
              path: fullPath,
              type: procedure?._def.type ?? 'unknown',
            });
            throw cause;
          }
        },
      );
    };
  };
}

/** @internal */
export type MergeRouters<
  TRouters extends AnyRouter[],
  TRoot extends AnyRootTypes = TRouters[0]['_def']['_config']['$types'],
  TRecord extends RouterRecord = {},
> = TRouters extends [
  infer Head extends AnyRouter,
  ...infer Tail extends AnyRouter[],
]
  ? MergeRouters<Tail, TRoot, Head['_def']['record'] & TRecord>
  : BuiltRouter<TRoot, TRecord>;

export function mergeRouters<TRouters extends AnyRouter[]>(
  ...routerList: [...TRouters]
): MergeRouters<TRouters> {
  const record = mergeWithoutOverrides(
    {},
    ...routerList.map((r) => r._def.record),
  );
  const errorFormatter = routerList.reduce(
    (currentErrorFormatter, nextRouter) => {
      if (
        nextRouter._def._config.errorFormatter &&
        nextRouter._def._config.errorFormatter !== defaultFormatter
      ) {
        if (
          currentErrorFormatter !== defaultFormatter &&
          currentErrorFormatter !== nextRouter._def._config.errorFormatter
        ) {
          throw new Error('You seem to have several error formatters');
        }
        return nextRouter._def._config.errorFormatter;
      }
      return currentErrorFormatter;
    },
    defaultFormatter,
  );

  const transformer = routerList.reduce((prev, current) => {
    if (
      current._def._config.transformer &&
      current._def._config.transformer !== defaultTransformer
    ) {
      if (
        prev !== defaultTransformer &&
        prev !== current._def._config.transformer
      ) {
        throw new Error('You seem to have several transformers');
      }
      return current._def._config.transformer;
    }
    return prev;
  }, defaultTransformer);

  const router = createRouterFactory({
    errorFormatter,
    transformer,
    isDev: routerList.every((r) => r._def._config.isDev),
    allowOutsideOfServer: routerList.every(
      (r) => r._def._config.allowOutsideOfServer,
    ),
    isServer: routerList.every((r) => r._def._config.isServer),
    $types: routerList[0]?._def._config.$types,
  })(record);

  return router as MergeRouters<TRouters>;
}
