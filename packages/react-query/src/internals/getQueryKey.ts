import { skipToken } from '@tanstack/react-query';
import {
  isObject,
  type DeepPartial,
} from '@trpc/server/unstable-core-do-not-import';
import type { DecoratedMutation, DecoratedQuery } from '../createTRPCReact';
import type { DecorateRouterRecord } from '../shared';

export type QueryType = 'any' | 'infinite' | 'query';

export type TRPCQueryKey = [
  readonly string[],
  { input?: unknown; type?: Exclude<QueryType, 'any'> }?,
];

export type TRPCMutationKey = [readonly string[]]; // = [TRPCQueryKey[0]]

/**
 * Passed to `_def()` by `getQueryKey()` so the hydration helpers can tell it
 * apart from a call to a procedure named `_def`.
 * @internal
 */
export const getQueryKeyMarker = Symbol.for('trpc.getQueryKey');

/**
 * A procedure of `createServerSideHelpers()` or `createHydrationHelpers()`
 */
type ServerSideProcedure<TInput> = {
  prefetch: (input: TInput, ...rest: any[]) => Promise<void>;
  // `useUtils()` procedures have `prefetch()` as well, but they can't give a key
  setData?: never;
};

type ServerSideRouterRecord = {
  [key: string]: ServerSideProcedure<any> | ServerSideRouterRecord;
};

type ProcedureOrRouter =
  | DecoratedMutation<any>
  | DecoratedQuery<any>
  | DecorateRouterRecord<any, any>
  | ServerSideProcedure<any>
  | ServerSideRouterRecord;

/**
 * To allow easy interactions with groups of related queries, such as
 * invalidating all queries of a router, we use an array as the path when
 * storing in tanstack query.
 **/
export function getQueryKeyInternal(
  path: readonly string[],
  input: unknown,
  type: QueryType,
): TRPCQueryKey {
  // Construct a query key that is easy to destructure and flexible for
  // partial selecting etc.
  // https://github.com/trpc/trpc/issues/3128

  // some parts of the path may be dot-separated, split them up
  const splitPath = path.flatMap((part) => part.split('.'));

  if (typeof input === 'undefined' && (!type || type === 'any')) {
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

export function getMutationKeyInternal(path: readonly string[]) {
  return getQueryKeyInternal(path, undefined, 'any') as TRPCMutationKey;
}

type GetInfiniteQueryInput<
  TProcedureInput,
  TInputWithoutCursorAndDirection = Omit<
    TProcedureInput,
    'cursor' | 'direction'
  >,
> = keyof TInputWithoutCursorAndDirection extends never
  ? undefined
  : DeepPartial<TInputWithoutCursorAndDirection> | undefined;

/** @internal */
export type GetQueryProcedureInput<TProcedureInput> = TProcedureInput extends {
  cursor?: any;
}
  ? GetInfiniteQueryInput<TProcedureInput>
  : DeepPartial<TProcedureInput> | undefined;

type GetParams<TProcedureOrRouter extends ProcedureOrRouter> =
  TProcedureOrRouter extends DecoratedQuery<infer $Def>
    ? [input?: GetQueryProcedureInput<$Def['input']>, type?: QueryType]
    : TProcedureOrRouter extends ServerSideProcedure<infer $Input>
      ? [input?: GetQueryProcedureInput<$Input>, type?: QueryType]
      : [];

/**
 * Returns the TanStack Query key for a procedure or router.
 * @param procedureOrRouter - a procedure or router from `createTRPCReact`
 * @param input - the procedure input. Leave it out to match every input in
 * fuzzy operations like `invalidateQueries`.
 * @param type - `'query'`, `'infinite'` or `'any'` (default). `'any'` leaves
 * the type out of the key, so exact reads like `getQueryData` need the same
 * input the query used and the matching type. Infinite query keys leave out
 * `cursor` and `direction`.
 *
 * @deprecated `@trpc/react-query` only gets bug fixes and will be removed in
 * the next major version. Use `@trpc/tanstack-react-query` instead, where
 * each query procedure has a `queryKey()` method and each router has a
 * `pathKey()` method.
 * @see https://trpc.io/docs/client/tanstack-react-query/migrating
 * @see https://trpc.io/docs/client/tanstack-react-query/usage#queryKey
 * @see https://trpc.io/docs/client/react/getQueryKey
 */
export function getQueryKey<TProcedureOrRouter extends ProcedureOrRouter>(
  procedureOrRouter: TProcedureOrRouter,
  ..._params: GetParams<TProcedureOrRouter>
) {
  const [input, type] = _params;

  // @ts-expect-error - we don't expose _def on the type layer
  const path = procedureOrRouter._def(getQueryKeyMarker).path as string[];
  const queryKey = getQueryKeyInternal(path, input, type ?? 'any');
  return queryKey;
}

// TODO: look over if we can't use a single type
export type QueryKeyKnown<TInput, TType extends Exclude<QueryType, 'any'>> = [
  string[],
  { input?: GetQueryProcedureInput<TInput>; type: TType }?,
];

/**
 * Returns the TanStack Query mutation key for a procedure.
 *
 * @deprecated `@trpc/react-query` only gets bug fixes and will be removed in
 * the next major version. Use `@trpc/tanstack-react-query` instead, where
 * each mutation has a `mutationKey()` method.
 * @see https://trpc.io/docs/client/tanstack-react-query/migrating
 * @see https://trpc.io/docs/client/tanstack-react-query/usage#mutationKey
 * @see https://trpc.io/docs/client/react/getQueryKey#mutations
 */
export function getMutationKey<TProcedure extends DecoratedMutation<any>>(
  procedure: TProcedure,
) {
  // @ts-expect-error - we don't expose _def on the type layer
  const path = procedure._def().path as string[];
  return getMutationKeyInternal(path);
}
