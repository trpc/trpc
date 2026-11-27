import type { AnyRouter } from '@trpc/server/unstable-core-do-not-import';

declare const routerTypeBrand: unique symbol;

/**
 * A value that carries a router's type and nothing else. Made by
 * {@link routerType}.
 * @public
 */
export interface RouterType<TRouter extends AnyRouter> {
  readonly [routerTypeBrand]: TRouter;
}

/**
 * Passes a router's type to `createTRPCClient({ router })` as a normal
 * option, instead of a type argument. Nothing about the router exists at
 * runtime, so it's safe to import the router's type only.
 *
 * @example
 * ```ts
 * const client = createTRPCClient({
 *   router: routerType<AppRouter>(),
 *   links: [httpBatchLink({ url: 'http://localhost:3000/trpc' })],
 * });
 * ```
 * @see https://trpc.io/docs/client/vanilla/setup#3-initialize-the-trpc-client
 * @public
 */
export function routerType<TRouter extends AnyRouter>(): RouterType<TRouter> {
  return {} as RouterType<TRouter>;
}
