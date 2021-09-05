type AsyncFn<T> = () => Promise<T> | T;
/**
 * Wrap a function in a safe wrapper that never throws
 * Returns a discriminated union
 */
export async function wrapCallSafe<T>(fn: AsyncFn<T>) {
  try {
    const data = await fn();
    return {
      ok: true as const,
      data,
    };
  } catch (cause) {
    return {
      ok: false as const,
      error: cause,
    };
  }
}
