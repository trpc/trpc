import { GetQueryKeyReturnType, QueryType, queryTypes } from './getQueryKey';

export type GetArrayQueryKeyReturnType =
  | [string[], unknown?, Omit<QueryType, 'all'>?]
  | [];
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

  // Make sure we omit the type for any query key that does not want to
  // specifically select to allow react query fuzzy matching)
  // NOTE: We know type if provided will be a `string` where as input will be an `object`
  if (type === 'any') {
    return input === undefined ? [arrayPath] : [arrayPath, input];
  } else {
    return input === undefined ? [arrayPath, type] : [arrayPath, input, type];
  }
}

// An example util function on how to get back from a reactQuery queryKey to a
// known trpc internal query key
export function getQueryKeyFromArrayQueryKey(
  arrayQueryKey: GetArrayQueryKeyReturnType,
): GetQueryKeyReturnType {
  const [arrayPath, ...rest] = arrayQueryKey;

  const path = arrayPath?.join('.') || '';

  const type = (rest.find(
    (val) =>
      typeof val === 'string' &&
      queryTypes.some((queryType) => queryType === val),
  ) || 'any') as QueryType;

  const input = rest.find((val) => typeof val === 'object');

  return [type, path, input];
}

// An utility function / example of how to process one of the tRPC used
// reactQuery Array Keys into known constituents
export function getArrayQueryKeyConstituents(
  arrayQueryKey: GetArrayQueryKeyReturnType,
) {
  const [arrayPath, ...rest] = arrayQueryKey;

  const type = (rest.find(
    (val) =>
      typeof val === 'string' &&
      queryTypes.some((queryType) => queryType === val),
  ) || 'any') as QueryType;

  const input = rest.find((val) => typeof val === 'object');

  return {
    type,
    arrayPath,
    input,
  };
}
