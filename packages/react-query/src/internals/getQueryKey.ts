import type {
  AnyMutationProcedure,
  AnyQueryProcedure,
  AnyRouter,
  DeepPartial,
  inferProcedureInput,
} from '@trpc/server';
import type { QueryType } from '../internals/getArrayQueryKey';
import { getArrayQueryKey } from '../internals/getArrayQueryKey';
import type { DecoratedProcedureRecord, DecorateProcedure } from '../shared';

/**
 * We treat `undefined` as an input the same as omitting an `input`
 * https://github.com/trpc/trpc/issues/2290
 */
export function getQueryKeyInternal(
  path: string,
  input: unknown,
): [string, unknown] | [string] {
  if (path.length) return input === undefined ? [path] : [path, input];
  return [] as unknown as [string];
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
    | AnyMutationProcedure
    | AnyQueryProcedure
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
    | AnyMutationProcedure
    | AnyQueryProcedure
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
    | AnyMutationProcedure
    | AnyQueryProcedure
    | AnyRouter,
  TPath extends string,
  TFlags,
>(..._params: GetQueryKeyParams<TProcedureOrRouter, TPath, TFlags>) {
  const [procedureOrRouter, input, type] = _params;
  // @ts-expect-error - we don't expose _def on the type layer
  const path = procedureOrRouter._def().path as string[];
  const dotPath = path.join('.');
  const queryKey = getArrayQueryKey(
    getQueryKeyInternal(dotPath, input),
    type ?? 'any',
  );
  return queryKey;
}
