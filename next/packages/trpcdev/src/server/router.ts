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
 * @since 12.0.0-alpha.0
 * @stability experimental
 */
export interface AnyRouter {
  readonly [key: string]: AnyProcedure | AnyRouter;
}

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
 * @since 12.0.0-alpha.0
 * @stability experimental
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
 * Finds the procedure at a dotted path, using own properties only.
 * @since 12.0.0-alpha.0
 * @stability experimental
 */
export function getProcedure(
  router: AnyRouter,
  path: string,
): AnyProcedure | undefined {
  let node: unknown = router;
  for (const segment of path.split('.')) {
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
  return isProcedure(node) ? node : undefined;
}

type RouterMap<R, F extends 'input' | 'output' | 'errors'> = {
  [K in keyof R]: R[K] extends AnyProcedure
    ? ProcedureDefOf<R[K]>[F]
    : RouterMap<R[K], F>;
};

/**
 * Every procedure's input, by path.
 * @since 12.0.0-alpha.0
 * @stability experimental
 */
export type inferRouterInputs<R> = RouterMap<R, 'input'>;
/**
 * Every procedure's output, by path.
 * @since 12.0.0-alpha.0
 * @stability experimental
 */
export type inferRouterOutputs<R> = RouterMap<R, 'output'>;

type AllDefs<R> = R extends AnyProcedure
  ? ProcedureDefOf<R>
  : { [K in keyof R]: AllDefs<R[K]> }[keyof R];
type DefField<R, F extends keyof ProcedureDef> =
  AllDefs<R> extends infer D ? (D extends ProcedureDef ? D[F] : never) : never;

/**
 * The union of every procedure's typed errors.
 * @since 12.0.0-alpha.0
 * @stability experimental
 */
export type inferRouterErrors<R> = DefField<R, 'errors'>;
/**
 * The Effect services the handler's `layer` must provide (02 S1).
 * @since 12.0.0-alpha.0
 * @stability experimental
 */
export type inferRouterServices<R> = DefField<R, 'services'>;
/**
 * The ctx `createContext` must return: every procedure's root ctx.
 * @since 12.0.0-alpha.0
 * @stability experimental
 */
export type inferRouterContext<R> = Simplify<
  UnionToIntersection<DefField<R, 'ctx'>>
>;
