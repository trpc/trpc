export const queryTypes = ['infinite', 'query', 'any'] as const;
export type QueryType = typeof queryTypes[number];
export type GetQueryKeyReturnType = [QueryType, string, unknown?];

/**
 * We treat `undefined` as an input the same as omitting an `input`
 * https://github.com/trpc/trpc/issues/2290
 */
export function getQueryKey(
  type: QueryType,
  path: string,
  input: unknown,
): GetQueryKeyReturnType {
  return input === undefined ? [type, path] : [type, path, input];
}
