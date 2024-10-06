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

type ProcedureOrRouter =
  | DecoratedMutation<any>
  | DecoratedQuery<any>
  | DecorateRouterRecord<any, any>;

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
    : [];

/**
 * Method to extract the query key for a procedure
 * @param procedureOrRouter - procedure or AnyRouter
 * @param input - input to procedureOrRouter
 * @param type - defaults to `any`
 * @see https://trpc.io/docs/v11/getQueryKey
 */
export function getQueryKey<TProcedureOrRouter extends ProcedureOrRouter>(
  procedureOrRouter: TProcedureOrRouter,
  ..._params: GetParams<TProcedureOrRouter>
) {
  const [input, type] = _params;

  // @ts-expect-error - we don't expose _def on the type layer
  const path = procedureOrRouter._def().path as string[];
  const queryKey = getQueryKeyInternal(path, input, type ?? 'any');
  return queryKey;
}

// TODO: look over if we can't use a single type
export type QueryKeyKnown<TInput, TType extends Exclude<QueryType, 'any'>> = [
  string[],
  { input?: GetQueryProcedureInput<TInput>; type: TType }?,
];

/**
 * Method to extract the mutation key for a procedure
 * @param procedure - procedure
 * @see https://trpc.io/docs/v11/getQueryKey#mutations
 */
export function getMutationKey<TProcedure extends DecoratedMutation<any>>(
  procedure: TProcedure,
) {
  // @ts-expect-error - we don't expose _def on the type layer
  const path = procedure._def().path as string[];
  return getMutationKeyInternal(path);
}
