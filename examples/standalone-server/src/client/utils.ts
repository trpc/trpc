import { inferRouterError } from '@trpc/server';
import { AnyRouter } from '@trpc/server';
import { TRPCClient, TRPCClientErrorLike, TRPCClientError } from '@trpc/client';
import { AppRouter } from '../server';
type AsyncFn<T> = (...args: any[]) => Promise<T> | T;
/**
 * Wrap a function in a safe wrapper that never throws
 * Returns a discriminated union
 */
export async function wrapCallSafe<TData, TError>(fn: AsyncFn<TData>) {
  try {
    const data = await fn();
    return {
      ok: true as const,
      data,
    };
  } catch (cause) {
    return {
      ok: false as const,
      error: cause as TRPCClientError<AppRouter>,
    };
  }
}
