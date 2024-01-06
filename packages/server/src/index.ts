export { TRPCError } from '@trpc/core';
export {
  initTRPC,
  /**
   * @deprecated use `experimental_trpcMiddleware` instead
   */
  experimental_standaloneMiddleware,
  experimental_standaloneMiddleware as experimental_trpcMiddleware,
  type inferRouterInputs,
  type inferRouterOutputs,
  type inferProcedureInput,
  type inferProcedureOutput,
  type inferRouterError,
} from '@trpc/core';

export type {
  /**
   * @deprecated
   * Use `Awaited<ReturnType<T>>` instead
   */
  inferAsyncReturnType,
} from '@trpc/core';

export type {
  AnyRouter as AnyTRPCRouter,
  AnyProcedure as AnyTRPCProcedure,
  /**
   * @deprecated use `AnyTRPCRouter` instead
   */
  AnyRouter,
  /**
   * @deprecated use `AnyTRPCProcedure` instead
   */
  AnyProcedure,
} from '@trpc/core';

/**
 * @deprecated don't use internals from `@trpc/core
 */
export * as __unstable_do_not_import from '@trpc/core';
