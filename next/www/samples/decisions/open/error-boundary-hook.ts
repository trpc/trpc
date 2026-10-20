/**
 * The APIs `.agent-docs/open/error-boundary-hook.md` proposes, as types. A
 * is what `packages/tanstack-react-query/src/error-boundary.ts` builds,
 * not exported yet: the hook returns TanStack's hooks. B's hook returns
 * option transforms for TanStack's own hooks. C puts the hooks in the
 * tuple.
 */
import type {
  QueryKey,
  UseMutationOptions,
  UseMutationResult,
  UseQueryOptions,
  UseQueryResult,
} from '@tanstack/react-query';
import type {
  InfiniteOptionsOut,
  MutationOptionsOut,
  QueryOptionsOut,
} from '@trpc12/tanstack-react-query';
import type { ReactNode } from 'react';

/** `E` without what a boundary and the boundaries above it own. */
export type Remaining<
  E,
  TCodes extends string,
  TUnexpected extends boolean,
> = Exclude<
  Exclude<E, { readonly code: TCodes }>,
  TUnexpected extends true ? { readonly defined: false } : never
>;

declare const owned: unique symbol;

/** A boundary's component, carrying what it and its parents own as a type-only brand. */
export interface ErrorBoundaryComponent<
  TCodes extends string,
  TUnexpected extends boolean,
> {
  (props: { readonly children?: ReactNode }): ReactNode;
  readonly [owned]: {
    readonly codes: TCodes;
    readonly unexpected: TUnexpected;
  };
}

/** What every option's factory takes. */
export interface ErrorBoundarySpec<
  TCodes extends string,
  TUnexpected extends boolean,
  TParentCodes extends string,
  TParentUnexpected extends boolean,
> {
  readonly name: string;
  readonly parent?: ErrorBoundaryComponent<TParentCodes, TParentUnexpected>;
  readonly claims: ReadonlyArray<TCodes>;
  readonly unexpected?: TUnexpected;
  readonly fallback: (props: {
    readonly error: unknown;
    readonly reset: () => void;
  }) => ReactNode;
}

type Codes<TCodes extends string, TParentCodes extends string> =
  | TCodes
  | TParentCodes;
type Unexpected<
  TUnexpected extends boolean,
  TParentUnexpected extends boolean,
> = TUnexpected extends true ? true : TParentUnexpected;

/** A: the hook returns TanStack's hooks, wrapped. */
export interface HooksA<TCodes extends string, TUnexpected extends boolean> {
  useQuery<
    TQueryFnData,
    TError,
    TData = TQueryFnData,
    TQueryKey extends QueryKey = QueryKey,
  >(
    options: UseQueryOptions<TQueryFnData, TError, TData, TQueryKey>,
  ): UseQueryResult<TData, Remaining<TError, TCodes, TUnexpected>>;
  useMutation<TData, TError, TVariables, TOnMutateResult>(
    options: UseMutationOptions<TData, TError, TVariables, TOnMutateResult>,
  ): UseMutationResult<
    TData,
    Remaining<TError, TCodes, TUnexpected>,
    TVariables,
    TOnMutateResult
  >;
  owns(error: unknown): boolean;
}

export declare function createErrorBoundaryA<
  const TCodes extends string,
  TUnexpected extends boolean = false,
  TParentCodes extends string = never,
  TParentUnexpected extends boolean = false,
>(
  spec: ErrorBoundarySpec<TCodes, TUnexpected, TParentCodes, TParentUnexpected>,
): readonly [
  Boundary: ErrorBoundaryComponent<
    Codes<TCodes, TParentCodes>,
    Unexpected<TUnexpected, TParentUnexpected>
  >,
  useBoundary: () => HooksA<
    Codes<TCodes, TParentCodes>,
    Unexpected<TUnexpected, TParentUnexpected>
  >,
];

/** B: the hook returns transforms for tRPC's options, to pass to TanStack's own hooks. */
export interface OptionsB<TCodes extends string, TUnexpected extends boolean> {
  query<TQueryFnData, TError, TData>(
    options: QueryOptionsOut<TQueryFnData, TError, TData>,
  ): QueryOptionsOut<
    TQueryFnData,
    Remaining<TError, TCodes, TUnexpected>,
    TData
  >;
  infiniteQuery<TOutput, TError, TData, TPageParam>(
    options: InfiniteOptionsOut<TOutput, TError, TData, TPageParam>,
  ): InfiniteOptionsOut<
    TOutput,
    Remaining<TError, TCodes, TUnexpected>,
    TData,
    TPageParam
  >;
  mutation<TInput, TOutput, TError, TOnMutateResult>(
    options: MutationOptionsOut<TInput, TOutput, TError, TOnMutateResult>,
  ): MutationOptionsOut<
    TInput,
    TOutput,
    Remaining<TError, TCodes, TUnexpected>,
    TOnMutateResult
  >;
  owns(error: unknown): boolean;
}

export declare function createErrorBoundaryB<
  const TCodes extends string,
  TUnexpected extends boolean = false,
  TParentCodes extends string = never,
  TParentUnexpected extends boolean = false,
>(
  spec: ErrorBoundarySpec<TCodes, TUnexpected, TParentCodes, TParentUnexpected>,
): readonly [
  Boundary: ErrorBoundaryComponent<
    Codes<TCodes, TParentCodes>,
    Unexpected<TUnexpected, TParentUnexpected>
  >,
  useBoundary: () => OptionsB<
    Codes<TCodes, TParentCodes>,
    Unexpected<TUnexpected, TParentUnexpected>
  >,
];

/** C: the tuple holds the component and the hooks themselves. */
export declare function createErrorBoundaryC<
  const TCodes extends string,
  TUnexpected extends boolean = false,
  TParentCodes extends string = never,
  TParentUnexpected extends boolean = false,
>(
  spec: ErrorBoundarySpec<TCodes, TUnexpected, TParentCodes, TParentUnexpected>,
): readonly [
  Boundary: ErrorBoundaryComponent<
    Codes<TCodes, TParentCodes>,
    Unexpected<TUnexpected, TParentUnexpected>
  >,
  useBoundaryQuery: HooksA<
    Codes<TCodes, TParentCodes>,
    Unexpected<TUnexpected, TParentUnexpected>
  >['useQuery'],
  useBoundaryMutation: HooksA<
    Codes<TCodes, TParentCodes>,
    Unexpected<TUnexpected, TParentUnexpected>
  >['useMutation'],
];
