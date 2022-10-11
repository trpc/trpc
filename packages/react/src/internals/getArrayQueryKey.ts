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

  // Handle the case of acting on all queries ... path will not be passed or
  // it will be an empty string
  if (typeof path !== 'string' || path === '') {
    if (input === undefined) {
      return [[]];
    } else {
      return [[], ...input];
    }
  } else {
    const arrayPath = path.split('.');
    if (input === undefined) {
      return [arrayPath];
    } else {
      return [arrayPath, ...input];
    }
  }
}
