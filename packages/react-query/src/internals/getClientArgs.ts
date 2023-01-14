import { TRPCQueryKey } from './getQueryKey';

export function getClientArgs<TOptions>(
  queryKey: TRPCQueryKey,
  opts: TOptions,
  pageParam?: any,
) {
  const path = queryKey[0];
  const input = queryKey[1]?.input;
  if (pageParam) (input as any).cursor = pageParam;
  return [path.join('.'), input, (opts as any)?.trpc] as const;
}
