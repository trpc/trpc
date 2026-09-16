import type { TRPCQueryKey } from './getQueryKey';

/**
 * Constructs arguments for tRPC client calls from query key and options.
 * For infinite queries, cursor is injected only when pageParam is not
 * undefined. This preserves schema defaults (e.g. `z.number().default(0)`)
 * while correctly forwarding explicit null cursors (e.g. `z.number().nullable()`
 * with `initialCursor: null`) and fixing the falsy-check bug where pageParam 0
 * was silently dropped (fixes #6862).
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
      ...(infiniteParams.pageParam !== undefined
        ? { cursor: infiniteParams.pageParam }
        : {}),
      direction: infiniteParams.direction,
    };
  }
  return [path.join('.'), input, (opts as any)?.trpc] as const;
}
