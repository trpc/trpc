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
  /**
   * @deprecated use `AnyTRPCRouter` instead
   */
  AnyRouter,
} from '@trpc/core';

export const foo = 'bar';
