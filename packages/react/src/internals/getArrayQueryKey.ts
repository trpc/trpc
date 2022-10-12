/**
 * To allow easy interactions with groups of related queries, such as
 * invalidating all queries of a router, we use an array as the path when
 * storing in tanstack query. This function converts from the `.` separated
 * path passed around internally by both the legacy and proxy implementation.
 * https://github.com/trpc/trpc/issues/2611
 */
export function getArrayQueryKey(
  queryKey: string | [string] | [string, ...unknown[]] | unknown[],
): [string[]] | [string[], ...unknown[]] | [] {
  const queryKeyArrayed = Array.isArray(queryKey) ? queryKey : [queryKey];
  const [path, ...input] = queryKeyArrayed;

  const arrayPath =
    typeof path !== 'string' || path === '' ? [] : path.split('.');

  return [arrayPath, ...input];
}
