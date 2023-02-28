import {
  AnyMutationProcedure,
  AnyQueryProcedure,
  AnyRouter,
  DeepPartial,
  inferProcedureInput,
} from '@trpc/server';
import { DecorateProcedure, DecoratedProcedureRecord } from '../shared';

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
export function getQueryKeyInternal(
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

type GetInfiniteQueryInput<
  TProcedureInput,
  TInputWithoutCursor = Omit<TProcedureInput, 'cursor'>,
> = keyof TInputWithoutCursor extends never
  ? undefined
  : DeepPartial<TInputWithoutCursor> | undefined;

/** @internal */
export type GetQueryProcedureInput<TProcedureInput> = TProcedureInput extends {
  cursor?: any;
}
  ? GetInfiniteQueryInput<TProcedureInput>
  : DeepPartial<TProcedureInput> | undefined;

type GetQueryParams<
  TProcedureOrRouter extends AnyQueryProcedure,
  TProcedureInput = inferProcedureInput<TProcedureOrRouter>,
> = TProcedureInput extends undefined
  ? []
  : [input?: GetQueryProcedureInput<TProcedureInput>, type?: QueryType];

type GetParams<
  TProcedureOrRouter extends
    | AnyQueryProcedure
    | AnyMutationProcedure
    | AnyRouter,
  TPath extends string,
  TFlags,
> = TProcedureOrRouter extends AnyQueryProcedure
  ? [
      procedureOrRouter: DecorateProcedure<TProcedureOrRouter, TFlags, TPath>,
      ..._params: GetQueryParams<TProcedureOrRouter>,
    ]
  : TProcedureOrRouter extends AnyMutationProcedure
  ? [procedureOrRouter: DecorateProcedure<TProcedureOrRouter, TFlags, TPath>]
  : [
      procedureOrRouter: DecoratedProcedureRecord<
        TProcedureOrRouter['_def']['record'],
        TFlags,
        any
      >,
    ];

type GetQueryKeyParams<
  TProcedureOrRouter extends
    | AnyQueryProcedure
    | AnyMutationProcedure
    | AnyRouter,
  TPath extends string,
  TFlags,
> = GetParams<TProcedureOrRouter, TPath, TFlags>;

/**
 * Method to extract the query key for a procedure
 * @param procedureOrRouter - procedure or AnyRouter
 * @param input - input to procedureOrRouter
 * @param type - defaults to `any`
 * @link https://trpc.io/docs/getQueryKey
 */
export function getQueryKey<
  TProcedureOrRouter extends
    | AnyQueryProcedure
    | AnyMutationProcedure
    | AnyRouter,
  TPath extends string,
  TFlags,
>(..._params: GetQueryKeyParams<TProcedureOrRouter, TPath, TFlags>) {
  const [procedureOrRouter, input, type] = _params;
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
