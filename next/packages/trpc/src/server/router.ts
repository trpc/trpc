import type {
  Simplify,
  TypeError,
  UnionToIntersection,
} from '../internal/types.ts';
import {
  isProcedure,
  type AnyProcedure,
  type ProcedureDef,
  type ProcedureDefOf,
} from './procedure.ts';

/**
 * A router is a plain object of procedures and nested routers (08 A). Keys
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

/**
 * OpenAPI grouping for a subtree (08 Q8.3): a path prefix and tags. Only
 * the OpenAPI handler and generator read it.
 * @since 0.1.0
 * @stability stable
 */
export interface RouterGroup {
  /** Prepended to every route below: `/admin`. */
  readonly prefix?: `/${string}` | undefined;
  /** Added before each procedure's own tags. */
  readonly tags?: ReadonlyArray<string> | undefined;
}

const GROUP = '~group';

/**
 * Groups routes for OpenAPI (08 Q8.3). The result is the same plain object
 * (with the group kept off its keys), so types and RPC paths don't change.
 * Routers take no middleware: put it on a base procedure.
 *
 * @example
 * ```ts
 * const appRouter = {
 *   admin: t.router({ prefix: '/admin', tags: ['admin'] }, { users, ban }),
 * };
 * // RPC: admin.users; OpenAPI: GET /api/admin/users, tagged admin
 * ```
 * @since 0.1.0
 * @stability stable
 */
export function router<const TRoutes extends AnyRouter>(
  group: RouterGroup,
  routes: TRoutes,
): TRoutes {
  const copy = { ...routes };
  Object.defineProperty(copy, GROUP, { value: group, enumerable: false });
  return copy;
}

/** The group a router was made with, if any. @internal */
export const groupOf = (node: object): RouterGroup | undefined =>
  (node as { [GROUP]?: RouterGroup })[GROUP];

/**
 * Options for {@link lazy}.
 * @since 0.1.0
 * @stability stable
 */
export interface LazyOptions {
  /**
   * Every OpenAPI route of the subtree starts with this, which lets the
   * OpenAPI handler load the subtree on the first request under it. Without
   * it (or a `contract` on the handler), the handler loads it at startup.
   */
  readonly prefix?: `/${string}` | undefined;
}

/** @internal */
export interface LazyDef {
  readonly load: () => Promise<AnyRouter>;
  readonly prefix: `/${string}` | undefined;
  /** Set once loaded. */
  loaded: AnyRouter | undefined;
}

/**
 * A subtree that loads on first use (08 Q8.4). Made by {@link lazy}.
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
 * Loads a subtree on its first call (08 Q8.4), for large routers in
 * serverless functions that should start fast. The client types it as if it
 * were inline. With `prefix`, its OpenAPI routes all start with the prefix,
 * as in a `t.router({ prefix })` group.
 *
 * @example
 * ```ts
 * export const appRouter = {
 *   post: postRouter,
 *   admin: lazy(() => import('./admin.ts'), { prefix: '/admin' }),
 * };
 * ```
 * @since 0.1.0
 * @stability stable
 */
export function lazy<TRouter extends AnyRouter>(
  load: () => Promise<TRouter | { default: TRouter }>,
  opts: LazyOptions = {},
): LazyRouter<TRouter> {
  let pending: Promise<AnyRouter> | undefined;
  const def: LazyDef = {
    prefix: opts.prefix,
    loaded: undefined,
    load: () =>
      (pending ??= load().then((mod) => {
        const loaded =
          isLazyModule(mod) && !isProcedure(mod.default)
            ? mod.default
            : (mod as TRouter);
        def.loaded = loaded;
        return loaded;
      })),
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
  const merged: Record<string, unknown> = {};
  for (const router of routers) {
    for (const key of Object.keys(router)) {
      if (Object.hasOwn(merged, key)) {
        throw new Error(`mergeRouters: duplicate key "${key}"`);
      }
      merged[key] = router[key];
    }
  }
  return merged as never;
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
 * Synchronous when nothing needs loading.
 * @since 0.1.0
 * @stability stable
 */
export function resolveProcedure(
  router: AnyRouter,
  path: string,
): AnyProcedure | undefined | Promise<AnyProcedure | undefined> {
  const step = (
    node: unknown,
    segments: ReadonlyArray<string>,
  ): AnyProcedure | undefined | Promise<AnyProcedure | undefined> => {
    const found = walk(node, segments);
    if (isProcedure(found)) return found;
    if (found instanceof Pending) {
      return found.lazy['~lazy']
        .load()
        .then((loaded) => step(loaded, found.rest));
    }
    return undefined;
  };
  return step(router, path.split('.'));
}

/**
 * Loads every lazy subtree, for tools that need the whole router at once,
 * like `generateOpenApi` and `toContract`.
 *
 * @example
 * ```ts
 * const doc = generateOpenApi(await loadRouter(appRouter), { info });
 * ```
 * @since 0.1.0
 * @stability stable
 */
export async function loadRouter<TRouter extends AnyRouter>(
  router: TRouter,
): Promise<TRouter> {
  await Promise.all(
    Object.values(router).map(async (node) => {
      if (isProcedure(node)) return;
      const sub = isLazy(node) ? await node['~lazy'].load() : node;
      await loadRouter(sub as AnyRouter);
    }),
  );
  return router;
}

type RouterMap<R, F extends 'input' | 'output' | 'errors'> = {
  [K in keyof R]: R[K] extends AnyProcedure
    ? ProcedureDefOf<R[K]>[F]
    : RouterMap<Unlazy<R[K]>, F>;
};

/**
 * Every procedure's input, by path.
 * @since 0.1.0
 * @stability stable
 */
export type inferRouterInputs<R> = RouterMap<R, 'input'>;
/**
 * Every procedure's output, by path.
 * @since 0.1.0
 * @stability stable
 */
export type inferRouterOutputs<R> = RouterMap<R, 'output'>;

type AllDefs<R> = R extends AnyProcedure
  ? ProcedureDefOf<R>
  : { [K in keyof R]: AllDefs<Unlazy<R[K]>> }[keyof R];
type DefField<R, F extends keyof ProcedureDef> =
  AllDefs<R> extends infer D ? (D extends ProcedureDef ? D[F] : never) : never;

/**
 * The union of every procedure's typed errors.
 * @since 0.1.0
 * @stability stable
 */
export type inferRouterErrors<R> = DefField<R, 'errors'>;
/**
 * The Effect services the handler's `layer` must provide (02 S1).
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
