import { skipToken, type QueryClient } from '@tanstack/react-query';
import { isFunction, isObject } from '@trpc/server/unstable-core-do-not-import';
import type {
  AnyTRPCQueryKey,
  FeatureFlags,
  QueryType,
  TRPCMutationKey,
  TRPCMutationKeyWithoutPrefix,
  TRPCQueryKey,
  TRPCQueryKeyWithoutPrefix,
  TRPCQueryKeyWithPrefix,
  TRPCQueryOptionsResult,
} from './types';

/**
 * @internal
 */
export function createTRPCOptionsResult(value: {
  path: readonly string[];
}): TRPCQueryOptionsResult['trpc'] {
  const path = value.path.join('.');

  return {
    path,
  };
}

export function isPrefixedQueryKey(
  queryKey: TRPCQueryKey<any>,
): queryKey is TRPCQueryKeyWithPrefix {
  return queryKey.length >= 3;
}

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
 * @internal
 */
export function getClientArgs<TOptions, TFeatureFlags extends FeatureFlags>(
  queryKey: TRPCQueryKey<TFeatureFlags['enablePrefix']>,
  opts: TOptions,
  infiniteParams?: {
    pageParam: any;
    direction: 'forward' | 'backward';
  },
) {
  const queryKeyData = readQueryKey(queryKey);

  let input = queryKeyData.args?.input;
  if (infiniteParams) {
    input = {
      ...(queryKeyData.args?.input ?? {}),
      ...(infiniteParams.pageParam !== undefined
        ? { cursor: infiniteParams.pageParam }
        : {}),
      direction: infiniteParams.direction,
    };
  }
  return [queryKeyData.path.join('.'), input, (opts as any)?.trpc] as const;
}

/**
 * @internal
 */
export async function buildQueryFromAsyncIterable<
  TQueryKey extends TRPCQueryKey<any>,
>(
  asyncIterable: AsyncIterable<unknown>,
  queryClient: QueryClient,
  queryKey: TQueryKey,
) {
  const queryCache = queryClient.getQueryCache();

  const query = queryCache.build(queryClient, {
    queryKey,
  });

  query.setState({
    data: [],
    status: 'success',
  });

  const aggregate: unknown[] = [];
  for await (const value of asyncIterable) {
    aggregate.push(value);

    query.setState({
      data: [...aggregate],
    });
  }
  return aggregate;
}

/**
 * To allow easy interactions with groups of related queries, such as
 * invalidating all queries of a router, we use an array as the path when
 * storing in tanstack query.
 *
 * @internal
 */
export function getQueryKeyInternal<TPrefix extends readonly string[]>(opts: {
  path: readonly string[];
  input?: unknown;
  type: QueryType;
  prefix?: TPrefix;
}): TRPCQueryKey<TPrefix extends undefined ? false : true> {
  // Construct a query key that is easy to destructure and flexible for
  // partial selecting etc.
  // https://github.com/trpc/trpc/issues/3128

  // some parts of the path may be dot-separated, split them up
  const prefix = opts.prefix?.length === 0 ? undefined : opts.prefix;
  const splitPath = opts.path.flatMap((part) => part.split('.'));

  if (!opts.input || opts.type === 'any') {
    // this matches also all mutations (see `getMutationKeyInternal`)

    // for `utils.invalidate()` to match all queries (including vanilla react-query)
    // we don't want nested array if path is empty, i.e. `[]` instead of `[[]]`

    if (prefix) {
      return splitPath.length
        ? ([prefix, splitPath] as TRPCQueryKey<
            TPrefix extends undefined ? false : true
          >)
        : ([prefix] as TRPCQueryKey<TPrefix extends undefined ? false : true>);
    } else {
      return splitPath.length
        ? [splitPath]
        : ([] as unknown as TRPCQueryKeyWithoutPrefix);
    }
  }

  if (
    opts.type === 'infinite' &&
    isObject(opts.input) &&
    ('direction' in opts.input || 'cursor' in opts.input)
  ) {
    const {
      cursor: _,
      direction: __,
      ...inputWithoutCursorAndDirection
    } = opts.input;

    if (!prefix) {
      return [
        prefix,
        splitPath,
        {
          input: inputWithoutCursorAndDirection,
          type: 'infinite',
        },
      ] as unknown as TRPCQueryKey<TPrefix extends undefined ? false : true>;
    } else {
      return [
        splitPath,
        {
          input: inputWithoutCursorAndDirection,
          type: 'infinite',
        },
      ];
    }
  }

  if (prefix) {
    return [
      prefix,
      splitPath,
      {
        ...(typeof opts.input !== 'undefined' &&
          opts.input !== skipToken && { input: opts.input }),
        ...{ type: opts.type },
      },
    ] as unknown as TRPCQueryKey<TPrefix extends undefined ? false : true>;
  } else {
    return [
      splitPath,
      {
        ...(typeof opts.input !== 'undefined' &&
          opts.input !== skipToken && { input: opts.input }),
        ...{ type: opts.type },
      },
    ];
  }
}

/**
 * @internal
 */
export function getMutationKeyInternal<
  TPrefix extends readonly string[] | undefined,
>(
  path: readonly string[],
  opts: {
    prefix?: TPrefix;
  } = {},
): TRPCMutationKey<TPrefix extends undefined ? false : true> {
  const prefix = opts.prefix?.length === 0 ? [] : opts.prefix;

  // some parts of the path may be dot-separated, split them up
  const splitPath = path.flatMap((part) => part.split('.'));

  if (prefix) {
    return splitPath.length
      ? ([prefix, splitPath] as unknown as TRPCMutationKey<
          TPrefix extends undefined ? false : true
        >)
      : [prefix];
  } else {
    return splitPath.length
      ? [splitPath]
      : ([] as unknown as TRPCMutationKeyWithoutPrefix);
  }
}

/**
 * @internal
 */
export function unwrapLazyArg<T>(valueOrLazy: T | (() => T)): T {
  return (isFunction(valueOrLazy) ? valueOrLazy() : valueOrLazy) as T;
}
