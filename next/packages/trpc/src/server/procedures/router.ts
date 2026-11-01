import { Effect, Equal } from 'effect';
import type {
  ChainTypes,
  ClientTypes,
  ContractAt,
  DecodedForm,
  DecodedFormOf,
  Decodes,
  ResultForm,
} from '../../client/types.ts';
import type {
  ClientValue,
  IsAny,
  JsonForm,
  OutputForm,
  Simplify,
  TypeError,
  UnionToIntersection,
} from '../../internal/types.ts';
import {
  isProcedure,
  type AnyProcedure,
  type ProcedureDefOf,
} from './procedure.ts';

/**
 * A router is a plain object of procedures and nested routers. Keys
 * are path segments: `{ post: { byId } }` serves `post.byId`.
 *
 * @example
 * ```ts
 * export const appRouter = {
 *   health: t.procedure.query(() => 'ok'),
 *   post: { byId, create },
 * };
 * export type AppRouter = typeof appRouter;
 * ```
 * @since 0.1.0
 * @stability stable
 */
export interface AnyRouter {
  readonly [key: string]: AnyProcedure | AnyRouter | AnyLazyRouter;
}

type RouterForm<T> = '~router' extends keyof NonNullable<T>
  ? NonNullable<NonNullable<T>['~router' & keyof NonNullable<T>]>
  : never;

/**
 * The meta a router or lazy subtree takes: the root's meta keys whose type
 * names a router-level form with a type-only `'~router'` key, as the
 * `experimental_openapi()` extension's `route` does (`{ prefix?, tags? }`). Other keys
 * apply to procedures only.
 * @since 0.1.0
 * @stability stable
 */
export type RouterMeta<TMeta> = {
  [
    K in keyof TMeta as [RouterForm<TMeta[K]>] extends [never] ? never : K
  ]?: RouterForm<TMeta[K]>;
};

/**
 * Options for `t.router()` and `t.lazy()`.
 * @since 0.1.0
 * @stability stable
 */
export interface RouterOptions<TMeta = Record<string, unknown>> {
  /** Router-level meta, read by the extension that declares the key. */
  readonly meta?: ([keyof TMeta] extends [never] ? never : TMeta) | undefined;
}

const META = '~meta';

/**
 * A router with router-level meta. The result is the same plain
 * object (with the meta kept off its keys), so types and RPC paths don't
 * change. Routers take no middleware: put it on a base procedure.
 *
 * @example
 * ```ts
 * const t = initTrpc().concat(experimental_openapi());
 * const appRouter = {
 *   admin: t.router({ meta: { route: { prefix: '/admin', tags: ['admin'] } } }, { users, ban }),
 * };
 * // RPC: admin.users; OpenAPI: GET /api/admin/users, tagged admin
 * ```
 * @since 0.1.0
 * @stability stable
 */
export function router<const TRoutes extends AnyRouter>(
  opts: RouterOptions,
  routes: TRoutes,
): TRoutes {
  const copy = { ...routes };
  Object.defineProperty(copy, META, { value: opts.meta, enumerable: false });
  return copy;
}

/**
 * The router-level meta a router or lazy subtree was made with.
 * @since 0.1.0
 * @stability stable
 */
export const routerMetaOf = (node: object): object | undefined =>
  isLazy(node)
    ? node['~lazy'].meta
    : (node as { [META]?: object | undefined })[META];

/** @internal */
export interface LazyDef {
  /**
   * Loads the subtree: concurrent callers share one load, and its result,
   * or its failure as a defect, is kept.
   */
  readonly loadEffect: Effect.Effect<AnyRouter>;
  /** {@link LazyDef.loadEffect} as a `Promise`. */
  readonly load: () => Promise<AnyRouter>;
  readonly meta: object | undefined;
  /** Set once loaded. */
  loaded: AnyRouter | undefined;
}

/**
 * A subtree that loads on first use. Made by {@link lazy}.
 * @since 0.1.0
 * @stability stable
 */
export interface LazyRouter<TRouter> {
  readonly '~lazy': LazyDef;
  readonly '~types'?: TRouter;
}

/**
 * Any lazy subtree.
 * @since 0.1.0
 * @stability stable
 */
export type AnyLazyRouter = LazyRouter<any>;

/**
 * A router type with its lazy subtree loaded.
 * @since 0.1.0
 * @stability stable
 */
export type Unlazy<T> = T extends LazyRouter<infer TRouter> ? TRouter : T;

/**
 * Loads a subtree on its first call, for large routers in
 * serverless functions that should start fast. The client types it as if it
 * were inline. `t.lazy(load, { meta })` also takes router-level meta, as
 * `t.router()` does.
 *
 * @example
 * ```ts
 * export const appRouter = {
 *   post: postRouter,
 *   admin: lazy(() => import('./admin.ts')),
 * };
 * ```
 * @since 0.1.0
 * @stability stable
 */
export function lazy<TRouter extends AnyRouter>(
  load: () => Promise<TRouter | { default: TRouter }>,
): LazyRouter<TRouter> {
  return lazyWith(load, {});
}

/** {@link lazy} with router-level meta, for `t.lazy`. @internal */
export function lazyWith<TRouter extends AnyRouter>(
  load: () => Promise<TRouter | { default: TRouter }>,
  opts: RouterOptions,
): LazyRouter<TRouter> {
  const def: LazyDef = {
    meta: opts.meta,
    loaded: undefined,
    loadEffect: Effect.promise(load).pipe(
      Effect.map((mod): AnyRouter => {
        const loaded =
          isLazyModule(mod) && !isProcedure(mod.default) ? mod.default : mod;
        checkRouterKeys(loaded);
        return loaded;
      }),
      Effect.tap((loaded) =>
        Effect.sync(() => {
          def.loaded = loaded;
        }),
      ),
      Effect.cached,
      Effect.runSync,
    ),
    load: () => Effect.runPromise(def.loadEffect),
  };
  return { '~lazy': def };
}

const isLazyModule = (mod: object): mod is { default: AnyRouter } =>
  Object.hasOwn(mod, 'default') &&
  typeof (mod as { default: unknown }).default === 'object';

/**
 * Whether a router node is a {@link lazy} subtree.
 * @since 0.1.0
 * @stability stable
 */
export const isLazy = (node: unknown): node is AnyLazyRouter =>
  typeof node === 'object' && node !== null && Object.hasOwn(node, '~lazy');

type DuplicateKeys<T extends readonly unknown[], Seen = never> = T extends [
  infer H,
  ...infer Rest,
]
  ? (keyof H & Seen) | DuplicateKeys<Rest, Seen | keyof H>
  : never;

/**
 * Merges routers. A key in more than one router is a type error and a
 * runtime error, unlike object spread, which silently keeps the last.
 *
 * Router-level meta (`t.router({ meta }, …)`) merges too: the result has
 * every meta key of its routers, so every procedure in it is under that
 * meta, as if the routers had been written as one. Two routers setting one
 * meta key to different values is a runtime error; nest them under their own
 * keys instead, so each keeps its meta.
 *
 * @example
 * ```ts
 * export const appRouter = mergeRouters(postRouter, userRouter);
 * ```
 * @since 0.1.0
 * @stability stable
 */
export function mergeRouters<const T extends readonly AnyRouter[]>(
  ...routers: T &
    ([DuplicateKeys<[...T]>] extends [never]
      ? unknown
      : TypeError<'mergeRouters: duplicate keys', DuplicateKeys<[...T]>>)
): Simplify<UnionToIntersection<T[number]>> {
  const merged: Record<string, AnyRouter[string]> = {};
  const meta: Record<string, unknown> = {};
  const metaFrom: Record<string, number> = {};
  for (const [i, router] of routers.entries()) {
    for (const key of Object.keys(router)) {
      if (Object.hasOwn(merged, key)) {
        throw new Error(`mergeRouters: duplicate key "${key}"`);
      }
      merged[key] = router[key]!;
    }
    for (const [key, value] of Object.entries(routerMetaOf(router) ?? {})) {
      if (value === undefined) continue;
      if (!Object.hasOwn(meta, key)) {
        meta[key] = value;
        metaFrom[key] = i;
      } else if (!Equal.equals(meta[key], value)) {
        const first = metaFrom[key]!;
        throw new Error(
          `mergeRouters: routers ${first + 1} (${describeKeys(routers[first]!)}) and ${i + 1} (${describeKeys(router)}) set router meta "${key}" to different values (${JSON.stringify(meta[key])} and ${JSON.stringify(value)}); nest them under keys of their own instead ({ a: …, b: … }), so each keeps its meta`,
        );
      }
    }
  }
  return (
    Object.keys(meta).length > 0 ? router({ meta }, merged) : merged
  ) as never;
}

const describeKeys = (router: AnyRouter): string => {
  const keys = Object.keys(router);
  return `{ ${keys.slice(0, 3).join(', ')}${keys.length > 3 ? ', …' : ''} }`;
};

/**
 * Throws on a router key no client can call: `then` (clients and their
 * nested routers can be awaited, so they read `then` as undefined) or a key
 * with a `.` (paths split on it). A lazy subtree is checked when it loads.
 * @internal
 */
export function checkRouterKeys(router: AnyRouter, prefix = ''): void {
  for (const key of Object.keys(router)) {
    const path = `${prefix}${key}`;
    if (key === 'then' || key.includes('.')) {
      throw new Error(
        key === 'then'
          ? `Router key "${path}": "then" is reserved, because clients can be awaited; rename it`
          : `Router key "${path}": "." separates path segments; nest it as { ${key.split('.')[0]}: { … } } instead`,
      );
    }
    const node: unknown = router[key];
    if (
      typeof node === 'object' &&
      node !== null &&
      !isProcedure(node) &&
      !isLazy(node)
    ) {
      checkRouterKeys(node as AnyRouter, `${path}.`);
    }
  }
}

/**
 * Finds the procedure at a dotted path, using own properties only. A lazy
 * subtree that hasn't loaded yet is not searched: use
 * {@link resolveProcedure}.
 * @since 0.1.0
 * @stability stable
 */
export function getProcedure(
  router: AnyRouter,
  path: string,
): AnyProcedure | undefined {
  const found = walk(router, path.split('.'));
  return isProcedure(found) ? found : undefined;
}

class Pending {
  readonly lazy: AnyLazyRouter;
  readonly rest: ReadonlyArray<string>;
  constructor(lazy: AnyLazyRouter, rest: ReadonlyArray<string>) {
    this.lazy = lazy;
    this.rest = rest;
  }
}

/** Follows segments, stopping at a lazy subtree that hasn't loaded. */
function walk(node: unknown, segments: ReadonlyArray<string>): unknown {
  for (const [i, segment] of segments.entries()) {
    if (isLazy(node)) {
      const loaded = node['~lazy'].loaded;
      if (!loaded) return new Pending(node, segments.slice(i));
      node = loaded;
    }
    if (
      typeof node !== 'object' ||
      node === null ||
      isProcedure(node) ||
      !Object.hasOwn(node, segment)
    ) {
      return undefined;
    }
    node = (node as Record<string, unknown>)[segment];
  }
  return node;
}

/**
 * Finds the procedure at a dotted path, loading lazy subtrees on the way.
 * It succeeds without waiting when nothing needs loading; a subtree that
 * fails to load is a defect, the loader's error. For a plain lookup of
 * what has loaded, use {@link getProcedure}.
 *
 * @example
 * ```ts
 * Effect.flatMap(resolveProcedure(router, path), (procedure) =>
 *   procedure ? callProcedure({ procedure, path, ctx, input, signal }) : Effect.fail(notFound),
 * );
 * ```
 * @since 0.1.0
 * @stability stable
 */
export function resolveProcedure(
  router: AnyRouter,
  path: string,
): Effect.Effect<AnyProcedure | undefined> {
  return resolveFrom(walk(router, path.split('.')));
}

const resolveFrom = (
  found: unknown,
): Effect.Effect<AnyProcedure | undefined> =>
  found instanceof Pending
    ? Effect.flatMap(found.lazy['~lazy'].loadEffect, (loaded) =>
        resolveFrom(walk(loaded, found.rest)),
      )
    : Effect.succeed(isProcedure(found) ? found : undefined);

/**
 * Loads every lazy subtree, for tools that need the whole router at once,
 * like `experimental_generateOpenApi` and `experimental_toContract`.
 *
 * @example
 * ```ts
 * const doc = experimental_generateOpenApi(await loadRouter(appRouter), { info });
 * ```
 * @since 0.1.0
 * @stability stable
 */
export function loadRouter<TRouter extends AnyRouter>(
  router: TRouter,
): Promise<TRouter> {
  return Effect.runPromise(loadRouterEffect(router));
}

/** {@link loadRouter} as an Effect. @internal */
export const loadRouterEffect = <TRouter extends AnyRouter>(
  router: TRouter,
): Effect.Effect<TRouter> => Effect.as(loadAll(router), router);

const loadAll = (router: AnyRouter): Effect.Effect<void> =>
  Effect.forEach(
    Object.values(router),
    (node) =>
      isProcedure(node)
        ? Effect.void
        : isLazy(node)
          ? Effect.flatMap(node['~lazy'].loadEffect, loadAll)
          : loadAll(node),
    { concurrency: 'unbounded', discard: true },
  );

type InputMap<R> = {
  [K in keyof R]: R[K] extends AnyProcedure
    ? ProcedureDefOf<R[K]>['input']
    : InputMap<Unlazy<R[K]>>;
};

type OutputMap<R, F extends OutputForm> = {
  [K in keyof R]: R[K] extends AnyProcedure
    ? ClientValue<ProcedureDefOf<R[K]>['output'], F>
    : OutputMap<Unlazy<R[K]>, F>;
};

/**
 * {@link OutputMap} on a chain whose links decode results with contract
 * `C`'s schemas, as the client's calls are typed there.
 */
type DecodedOutputMap<
  R,
  C,
  F extends OutputForm,
  TDecoded extends OutputForm,
> = {
  [K in keyof R]: R[K] extends AnyProcedure
    ? ClientValue<
        ProcedureDefOf<R[K]>['output'],
        DecodedForm<R[K], ContractAt<C, K>, F, TDecoded>
      >
    : DecodedOutputMap<Unlazy<R[K]>, ContractAt<C, K>, F, TDecoded>;
};

/** Picked once per client, so chains that decode nothing pay nothing per procedure. */
type ClientOutputMap<R, TLinks extends ChainTypes> = [Decodes<TLinks>] extends [
  never,
]
  ? OutputMap<R, ResultForm<undefined, TLinks>>
  : DecodedOutputMap<
      R,
      Decodes<TLinks>,
      ResultForm<undefined, TLinks>,
      DecodedFormOf<ResultForm<undefined, TLinks>>
    >;

/** What a client type, or a client factory's, records; `never` for a router. */
type SourceClient<T> = ClientTypes<T extends (...args: any) => infer C ? C : T>;

/**
 * Every procedure's input, by path, as the client's calls take it. `T` is
 * a router type, a client's type or a client factory's.
 *
 * @example
 * ```ts
 * type NewPost = inferRouterInputs<AppRouter>['post']['create'];
 * ```
 * @since 0.1.0
 * @stability stable
 */
export type inferRouterInputs<T> = InputMap<
  [SourceClient<T>] extends [never] ? T : SourceClient<T>['router']
>;
/**
 * Every procedure's output, by path, as a client receives it. For a client's
 * type (or a client factory's), outputs follow its links' transformer, as its
 * calls do; for a router type, they are in plain JSON's form, the default
 * transformer's (`Date` arrives as a `string`). A procedure's output as the
 * server returns it is `inferProcedureOutput`.
 *
 * @example
 * ```ts
 * type Post = inferRouterOutputs<typeof client>['post']['byId'];
 * ```
 * @since 0.1.0
 * @stability stable
 */
export type inferRouterOutputs<T> = [SourceClient<T>] extends [never]
  ? OutputMap<T, JsonForm>
  : ClientOutputMap<SourceClient<T>['router'], SourceClient<T>['links']>;

/**
 * What every procedure's def gives `F` (`never` from a def without it, as
 * `ctx` and `services` may be); an untyped (`any`) subtree adds none.
 */
type DefField<R, F extends 'errors' | 'ctx' | 'services'> =
  IsAny<R> extends true
    ? never
    : R extends AnyProcedure
      ? ProcedureDefOf<R>[F & keyof ProcedureDefOf<R>]
      : { [K in keyof R]: DefField<Unlazy<R[K]>, F> }[keyof R];

/**
 * The union of every procedure's typed errors.
 * @since 0.1.0
 * @stability stable
 */
export type inferRouterErrors<R> = DefField<R, 'errors'>;
/**
 * The Effect services the handler's `layer` must provide.
 * @since 0.1.0
 * @stability stable
 */
export type inferRouterServices<R> = DefField<R, 'services'>;
/**
 * The ctx `createContext` must return: every procedure's root ctx.
 * @since 0.1.0
 * @stability stable
 */
export type inferRouterContext<R> = Simplify<
  UnionToIntersection<DefField<R, 'ctx'>>
>;
