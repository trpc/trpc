import type { GetQueryProcedureInput } from './getQueryKey';

export type QueryType = 'any' | 'infinite' | 'query';

export type QueryKey = [
  string[],
  { input?: unknown; type?: Exclude<QueryType, 'any'> }?,
];

export type QueryKeyKnown<TInput, TType extends Exclude<QueryType, 'any'>> = [
  string[],
  { input?: GetQueryProcedureInput<TInput>; type: TType }?,
];

/**
 * To allow easy interactions with groups of related queries, such as
 * invalidating all queries of a router, we use an array as the path when
 * storing in tanstack query. This function converts from the `.` separated
 * path passed around internally by both the legacy and proxy implementation.
 * https://github.com/trpc/trpc/issues/2611
 **/
export function getArrayQueryKey(
  queryKey: unknown[] | string | [string, ...unknown[]] | [string],
  type: QueryType,
): QueryKey {
  const queryKeyArrayed = Array.isArray(queryKey) ? queryKey : [queryKey];
  const [path, input] = queryKeyArrayed;

  const arrayPath =
    typeof path !== 'string' || path === '' ? [] : path.split('.');

  // Construct a query key that is easy to destructure and flexible for
  // partial selecting etc.
  // https://github.com/trpc/trpc/issues/3128
  if (!input && (!type || type === 'any'))
    // for `utils.invalidate()` to match all queries (including vanilla react-query)
    // we don't want nested array if path is empty, i.e. `[]` instead of `[[]]`
    return arrayPath.length ? [arrayPath] : ([] as unknown as QueryKey);
  return [
    arrayPath,
    {
      ...(typeof input !== 'undefined' && { input: input }),
      ...(type && type !== 'any' && { type: type }),
    },
  ];
}
