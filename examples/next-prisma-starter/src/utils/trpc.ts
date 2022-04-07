import { createReactQueryHooks } from '@trpc/react';
import type { inferProcedureInput, inferProcedureOutput } from '@trpc/server';
import { NextPageContext } from 'next';
// ℹ️ Type-only import:
// https://www.typescriptlang.org/docs/handbook/release-notes/typescript-3-8.html#type-only-imports-and-export
import type { AppRouter } from '~/server/routers/_app';

/**
 * Extend `NextPageContext` with meta data that can be picked up by `responseMeta()` when server-side rendering
 */
export interface SSRContext extends NextPageContext {
  /**
   * Set HTTP Status code
   * @usage
   * const utils = trpc.useContext();
   * if (utils.ssrContext) {
   *   utils.ssrContext.status = 404;
   * }
   */
  status?: number;
}

/**
 * A set of strongly-typed React hooks from your `AppRouter` type signature with `createReactQueryHooks`.
 * @link https://trpc.io/docs/react#3-create-trpc-hooks
 */
export const trpc = createReactQueryHooks<AppRouter, SSRContext>();

// export const transformer = superjson;
/**
 * This is a helper method to infer the output of a query resolver
 * @example type HelloOutput = inferQueryOutput<'hello'>
 */
export type inferQueryOutput<
  TRouteKey extends keyof AppRouter['_def']['queries'],
> = inferProcedureOutput<AppRouter['_def']['queries'][TRouteKey]>;

export type inferQueryInput<
  TRouteKey extends keyof AppRouter['_def']['queries'],
> = inferProcedureInput<AppRouter['_def']['queries'][TRouteKey]>;

export type inferMutationOutput<
  TRouteKey extends keyof AppRouter['_def']['mutations'],
> = inferProcedureOutput<AppRouter['_def']['mutations'][TRouteKey]>;

export type inferMutationInput<
  TRouteKey extends keyof AppRouter['_def']['mutations'],
> = inferProcedureInput<AppRouter['_def']['mutations'][TRouteKey]>;
