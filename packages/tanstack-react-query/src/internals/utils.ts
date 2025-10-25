import { skipToken, type QueryClient } from '@tanstack/react-query';
import {
  isFunction,
  isObject,
  run,
} from '@trpc/server/unstable-core-do-not-import';
import type {
  AnyTRPCMutationKey,
  AnyTRPCQueryKey,
  FeatureFlags,
  QueryType,
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
  path: string[];
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
  queryKey: TRPCQueryKey<TFeatureFlags['keyPrefix']>,
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

    if (!input && type === 'any') {
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

/**
 * @internal
 */
export function getMutationKeyInternal(opts: {
  prefix: string | undefined;
  path: string[];
}): AnyTRPCMutationKey {
  // some parts of the path may be dot-separated, split them up
  const key: TRPCMutationKeyWithoutPrefix = [
    opts.path.flatMap((part) => part.split('.')),
  ];

  if (opts.prefix) {
    key.unshift([opts.prefix]);
  }
  return key;
}

/**
 * @internal
 */
export function unwrapLazyArg<T>(valueOrLazy: T | (() => T)): T {
  return (isFunction(valueOrLazy) ? valueOrLazy() : valueOrLazy) as T;
}
