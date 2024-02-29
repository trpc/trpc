import type { Observable } from '../observable';
import { createRecursiveProxy } from './createProxy';
import { defaultFormatter } from './error/formatter';
import { TRPCError } from './error/TRPCError';
import type { AnyProcedure, inferProcedureInput } from './procedure';
import type { ProcedureCallOptions } from './procedureBuilder';
import type { AnyRootTypes, RootConfig } from './rootConfig';
import { defaultTransformer } from './transformer';
import type { MaybePromise, ValueOf } from './types';
import { mergeWithoutOverrides, omitPrototype } from './utils';

export interface RouterRecord {
  [key: string]: AnyProcedure | RouterRecord;
}

type DecorateProcedure<TProcedure extends AnyProcedure> = (
  input: inferProcedureInput<TProcedure>,
) => Promise<
  TProcedure['_def']['type'] extends 'subscription'
    ? Observable<TProcedure['_def']['_output_out'], TRPCError>
    : TProcedure['_def']['_output_out']
>;

/**
 * @internal
 */
export type DecorateRouterRecord<TRecord extends RouterRecord> = {
  [TKey in keyof TRecord]: TRecord[TKey] extends AnyProcedure
    ? DecorateProcedure<TRecord[TKey]>
    : TRecord[TKey] extends RouterRecord
    ? DecorateRouterRecord<TRecord[TKey]>
    : never;
};

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
) => DecorateRouterRecord<TRecord>;

type LazyLoader<TAny> = {
  load: () => Promise<void>;
  ref: Lazy<TAny>;
};
export interface Router<
  TRoot extends AnyRootTypes,
  TRecord extends RouterRecord,
> {
  _def: {
    _config: RootConfig<TRoot>;
    router: true;
    procedure?: never;
    procedures: Record<string, AnyProcedure>;
    record: TRecord;
    lazy: Record<string, LazyLoader<AnyRouter>>;
  };
  /**
   * @deprecated use `t.createCallerFactory(router)` instead
   * @link https://trpc.io/docs/v11/server/server-side-calls
   */
  createCaller: RouterCaller<TRoot, TRecord>;
}

export type BuiltRouter<
  TRoot extends AnyRootTypes,
  TDef extends RouterRecord,
> = Router<TRoot, TDef> & TDef;

export type AnyRouter = Router<any, any>;

export type inferRouterRootTypes<TRouter extends AnyRouter> =
  TRouter['_def']['_config']['$types'];

export type inferRouterContext<TRouter extends AnyRouter> =
  inferRouterRootTypes<TRouter>['ctx'];
export type inferRouterError<TRouter extends AnyRouter> =
  inferRouterRootTypes<TRouter>['errorShape'];
export type inferRouterMeta<TRouter extends AnyRouter> =
  inferRouterRootTypes<TRouter>['meta'];

function isRouter(value: ValueOf<CreateRouterOptions>): value is AnyRouter {
  return typeof value === 'object' && value._def && 'router' in value._def;
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
];

const lazySymbol = Symbol('lazy');
export type Lazy<TAny> = (() => Promise<TAny>) & { [lazySymbol]: true };

export type CreateRouterOptions = {
  [key: string]:
    | AnyProcedure
    | AnyRouter
    | CreateRouterOptions
    | Lazy<AnyRouter>;
};

export function lazy<TAny>(getRouter: () => Promise<TAny>): Lazy<TAny> {
  let cachedPromise: Promise<TAny> | null = null;
  const lazyGetter = (() => {
    if (!cachedPromise) {
      cachedPromise = getRouter();
    }
    return cachedPromise;
  }) as Lazy<TAny>;
  lazyGetter[lazySymbol] = true;
  return lazyGetter;
}

function isLazy<TAny>(input: unknown): input is Lazy<TAny> {
  return typeof input === 'function' && lazySymbol in input;
}

export type DecorateCreateRouterOptions<
  TRouterOptions extends CreateRouterOptions,
> = {
  [K in keyof TRouterOptions]: TRouterOptions[K] extends infer $Value
    ? $Value extends AnyProcedure
      ? $Value
      : $Value extends Router<any, infer TRecord>
      ? TRecord
      : $Value extends CreateRouterOptions
      ? DecorateCreateRouterOptions<$Value>
      : $Value extends Lazy<infer $Lazy>
      ? $Lazy extends Router<any, infer TRecord>
        ? TRecord
        : never
      : never
    : never;
};

/**
 * @internal
 */
export function createRouterFactory<TRoot extends AnyRootTypes>(
  config: RootConfig<TRoot>,
) {
  function createRouterInner<TInput extends RouterRecord>(
    input: TInput,
  ): BuiltRouter<TRoot, TInput>;
  function createRouterInner<TInput extends CreateRouterOptions>(
    input: TInput,
  ): BuiltRouter<TRoot, DecorateCreateRouterOptions<TInput>>;
  function createRouterInner(input: RouterRecord | CreateRouterOptions) {
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
      path: string[];
      key: string;
      aggregate: RouterRecord;
    }): LazyLoader<AnyRouter> {
      return {
        ref: opts.ref,
        load: async () => {
          const router = await opts.ref();
          const lazyPath = [...opts.path, opts.key];
          const lazyKey = lazyPath.join('.');

          opts.aggregate[opts.key] = step(router._def.record, lazyPath);
          //
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
        },
      };
    }
    function step(from: CreateRouterOptions, path: string[] = []) {
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

    return {
      ...record,
      _def,
      createCaller: createCallerInner(_def),
    };
  }

  return createRouterInner;
}

function isProcedure(
  value: ValueOf<CreateRouterOptions>,
): value is AnyProcedure {
  return typeof value === 'function' && 'procedure' in value;
}

async function getProcedureAtPath(_def: AnyRouter['_def'], path: string) {
  let procedure = _def.procedures[path];

  while (!procedure) {
    const key = Object.keys(_def.lazy).find((key) => path.startsWith(key));
    // console.log(`found lazy: ${key ?? 'NOPE'} (fullPath: ${fullPath})`);

    if (!key) {
      throw new TRPCError({
        code: 'NOT_FOUND',
        message: `No "query"-procedure on path "${path}"`,
      });
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
  opts: ProcedureCallOptions & {
    _def: AnyRouter['_def'];

    allowMethodOverride?: boolean;
  },
) {
  const { type, path, _def } = opts;

  const procedure = await getProcedureAtPath(_def, path);

  if (procedure._def.type !== type && !opts.allowMethodOverride) {
    throw new TRPCError({
      code: 'NOT_FOUND',
      message: `No "${type}"-procedure on path "${path}"`,
    });
  }

  return procedure(opts);
}

function createCallerInner<
  TRoot extends AnyRootTypes,
  TRecord extends RouterRecord,
>(_def: Router<TRoot, TRecord>['_def']): RouterCaller<TRoot, TRecord> {
  type Context = TRoot['ctx'];

  return function createCaller(maybeContext) {
    const proxy = createRecursiveProxy(({ path, args }) => {
      const fullPath = path.join('.');

      async function callProc(ctx: Context) {
        const procedure = await getProcedureAtPath(_def, fullPath);

        return procedure({
          path: fullPath,
          getRawInput: async () => args[0],
          ctx,
          type: procedure._def.type,
        });
      }

      if (typeof maybeContext === 'function') {
        const context = (maybeContext as () => MaybePromise<Context>)();
        if (context instanceof Promise) {
          return context.then(callProc);
        }
        return callProc(context);
      }

      return callProc(maybeContext);
    });

    return proxy as ReturnType<RouterCaller<any, any>>;
  };
}

export function createCallerFactory<TRoot extends AnyRootTypes>() {
  return function createCaller<TRecord extends RouterRecord>(
    router: Router<TRoot, TRecord>,
  ): RouterCaller<TRoot, TRecord> {
    const _def = router._def;

    return createCallerInner(_def);
  };
}

/** @internal */
type MergeRouters<
  TRouters extends AnyRouter[],
  TRoot extends AnyRootTypes = TRouters[0]['_def']['_config']['$types'],
  // eslint-disable-next-line @typescript-eslint/ban-types
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
