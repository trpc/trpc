import { GetQueryKeyReturnType, QueryType } from './getQueryKey';

export type GetArrayQueryKeyReturnType =
  | [QueryType, string[]]
  | [QueryType, string[], unknown]
  | [QueryType];
/**
 * To allow easy interactions with groups of related queries, such as
 * invalidating all queries of a router, we use an array as the path when
 * storing in tanstack query. This function converts from the `.` separated
 * path passed around internally by both the legacy and proxy implementation.
 * https://github.com/trpc/trpc/issues/2611
 */
export function getArrayQueryKey(
  queryKey: GetQueryKeyReturnType,
): GetArrayQueryKeyReturnType {
  const [type, path, input] = queryKey;

  const arrayPath =
    typeof path !== 'string' || path === '' ? [] : path.split('.');

  return input === undefined ? [type, arrayPath] : [type, arrayPath, input];
}
