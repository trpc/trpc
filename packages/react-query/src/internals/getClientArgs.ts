import type { TRPCQueryKey } from './getQueryKey';

/**
 * @internal
 */
export function getClientArgs<TOptions>(
  queryKey: TRPCQueryKey,
  opts: TOptions,
  pageParam?: any,
) {
  const path = queryKey[0];
  let input = queryKey[1]?.input;
  if (pageParam) {
    input = {
      ...(input ?? {}),
      cursor: pageParam,
    };
  }
  return [path.join('.'), input, (opts as any)?.trpc] as const;
}
