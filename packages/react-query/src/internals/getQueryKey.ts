export type QueryType = 'query' | 'infinite' | 'any';

export type TRPCQueryKey = [
  string[],
  { input?: unknown; type?: Exclude<QueryType, 'any'> }?,
];

/**
 * To allow easy interactions with groups of related queries, such as
 * invalidating all queries of a router, we use an array as the path when
 * storing in tanstack query.
 **/
export function getQueryKey(
  path: string[],
  input: unknown,
  type: QueryType,
): TRPCQueryKey {
  // Construct a query key that is easy to destructure and flexible for
  // partial selecting etc.
  // https://github.com/trpc/trpc/issues/3128

  // some parts of the path may be dot-separated, split them up
  const splitPath = path.flatMap((part) => part.split('.'));

  if (!input && (!type || type === 'any'))
    // for `utils.invalidate()` to match all queries (including vanilla react-query)
    // we don't want nested array if path is empty, i.e. `[]` instead of `[[]]`
    return splitPath.length ? [splitPath] : ([] as unknown as TRPCQueryKey);
  return [
    splitPath,
    {
      ...(typeof input !== 'undefined' && { input: input }),
      ...(type && type !== 'any' && { type: type }),
    },
  ];
}
