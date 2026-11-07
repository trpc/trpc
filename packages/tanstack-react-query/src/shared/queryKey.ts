import { skipToken } from '@tanstack/react-query';
import { isObject, run } from '@trpc/server/unstable-core-do-not-import';

/**
 * The kind of query a key matches. `any` matches both.
 * @public
 */
export type QueryType = 'any' | 'infinite' | 'query';

/**
 * A tRPC query key: the procedure path, then the input and query type.
 * @see https://trpc.io/docs/client/tanstack-react-query/usage#queryKey
 * @public
 */
export type TRPCQueryKeyWithoutPrefix = [
  path: string[],
  opts?: { input?: unknown; type?: Exclude<QueryType, 'any'> },
];

/**
 * A tRPC query key that starts with a key prefix.
 * @see https://trpc.io/docs/client/tanstack-react-query/usage#keyPrefix
 * @public
 */
export type TRPCQueryKeyWithPrefix = [
  prefix: string[],
  ...TRPCQueryKeyWithoutPrefix,
];

/**
 * A tRPC query key, with a prefix if `TPrefixEnabled` is `true`.
 * @see https://trpc.io/docs/client/tanstack-react-query/usage#queryKey
 */
export type TRPCQueryKey<TPrefixEnabled extends boolean = false> =
  TPrefixEnabled extends true
    ? TRPCQueryKeyWithPrefix
    : TRPCQueryKeyWithoutPrefix;

/**
 * Any tRPC query key, with or without a prefix.
 */
export type AnyTRPCQueryKey =
  | TRPCQueryKeyWithoutPrefix
  | TRPCQueryKeyWithPrefix;

/**
 * @internal
 */
export function isPrefixedQueryKey(
  queryKey: AnyTRPCQueryKey,
): queryKey is TRPCQueryKeyWithPrefix {
  return queryKey.length >= 3;
}

/**
 * @internal
 */
export function readQueryKey(queryKey: AnyTRPCQueryKey) {
  if (isPrefixedQueryKey(queryKey)) {
    return {
      type: 'prefixed' as const,
      prefix: queryKey[0],
      path: queryKey[1],
      args: queryKey[2],
    };
  } else {
    return {
      type: 'unprefixed' as const,
      prefix: undefined,
      path: queryKey[0],
      args: queryKey[1],
    };
  }
}

/**
 * To allow easy interactions with groups of related queries, such as
 * invalidating all queries of a router, we use an array as the path when
 * storing in tanstack query.
 *
 * @internal
 */
export function getQueryKeyInternal(opts: {
  path: string[];
  input?: unknown;
  type: QueryType;
  prefix: string | undefined;
}): AnyTRPCQueryKey {
  const key = run((): TRPCQueryKeyWithoutPrefix => {
    const { input, type } = opts;

    // Construct a query key that is easy to destructure and flexible for
    // partial selecting etc.
    // https://github.com/trpc/trpc/issues/3128

    // some parts of the path may be dot-separated, split them up
    const splitPath = opts.path.flatMap((part) => part.split('.'));

    if (typeof input === 'undefined' && type === 'any') {
      // this matches also all mutations (see `getMutationKeyInternal`)

      // for `utils.invalidate()` to match all queries (including vanilla react-query)
      // we don't want nested array if path is empty, i.e. `[]` instead of `[[]]`
      return splitPath.length ? [splitPath] : ([] as unknown as TRPCQueryKey);
    }

    if (
      type === 'infinite' &&
      isObject(input) &&
      ('direction' in input || 'cursor' in input)
    ) {
      const {
        cursor: _,
        direction: __,
        ...inputWithoutCursorAndDirection
      } = input;
      return [
        splitPath,
        {
          input: inputWithoutCursorAndDirection,
          type: 'infinite',
        },
      ];
    }

    return [
      splitPath,
      {
        ...(typeof input !== 'undefined' &&
          input !== skipToken && { input: input }),
        ...(type && type !== 'any' && { type: type }),
      },
    ];
  });

  if (opts.prefix) {
    key.unshift([opts.prefix]);
  }
  return key;
}
