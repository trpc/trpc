import { skipToken, type QueryClient } from '@tanstack/react-query';
import { isFunction, isObject } from '@trpc/server/unstable-core-do-not-import';
import type {
  QueryType,
  TRPCMutationKey,
  TRPCQueryKey,
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

/**
 * @internal
 */
export function getClientArgs<TOptions>(
  queryKey: TRPCQueryKey,
  opts: TOptions,
  infiniteParams?: {
    pageParam: any;
    direction: 'forward' | 'backward';
  },
) {
  const path = queryKey[0];
  let input = queryKey[1]?.input;
  if (infiniteParams) {
    input = {
      ...(input ?? {}),
      ...(infiniteParams.pageParam ? { cursor: infiniteParams.pageParam } : {}),
      direction: infiniteParams.direction,
    };
  }
  return [path.join('.'), input, (opts as any)?.trpc] as const;
}

/**
 * @internal
 */
export async function buildQueryFromAsyncIterable(
  asyncIterable: AsyncIterable<unknown>,
  queryClient: QueryClient,
  queryKey: TRPCQueryKey,
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
export function getQueryKeyInternal(
  path: readonly string[],
  input?: unknown,
  type?: QueryType,
): TRPCQueryKey {
  // Construct a query key that is easy to destructure and flexible for
  // partial selecting etc.
  // https://github.com/trpc/trpc/issues/3128

  // some parts of the path may be dot-separated, split them up
  const splitPath = path.flatMap((part) => part.split('.'));

  if (!input && (!type || type === 'any')) {
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
}

/**
 * @internal
 */
export function getMutationKeyInternal(
  path: readonly string[],
): TRPCMutationKey {
  // some parts of the path may be dot-separated, split them up
  const splitPath = path.flatMap((part) => part.split('.'));

  return splitPath.length ? [splitPath] : ([] as unknown as TRPCMutationKey);
}

/**
 * @internal
 */
export function unwrapLazyArg<T>(valueOrLazy: T | (() => T)): T {
  return (isFunction(valueOrLazy) ? valueOrLazy() : valueOrLazy) as T;
}
