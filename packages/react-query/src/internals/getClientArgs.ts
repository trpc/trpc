import type { TRPCQueryKey } from './getQueryKey';

/**
 * @internal
 */
export function getClientArgs<TOptions>(
  queryKey: TRPCQueryKey,
  opts: TOptions,
  infiniteParams?: {
    pageParam: any;
    direction: 'forward' | 'backward';
  },
) {
  const path = queryKey[0];
  let input = queryKey[1]?.input;
  if (infiniteParams) {
    input = {
      ...(input ?? {}),
      ...(infiniteParams.pageParam ? { cursor: infiniteParams.pageParam } : {}),
      direction: infiniteParams.direction,
    };
  }
  return [path.join('.'), input, (opts as any)?.trpc] as const;
}
