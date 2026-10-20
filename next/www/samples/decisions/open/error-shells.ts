/**
 * The APIs `.agent-docs/open/error-shells.md` proposes, as types, from the
 * spike (`spikes/error-shells/shells.ts`): B is `createShell` in boundary
 * mode, C adds a side-effect mode, D ships only the primitives. A is
 * TanStack's hooks as they are.
 */
import type {
  QueryKey,
  UseMutationOptions,
  UseMutationResult,
  UseQueryOptions,
  UseQueryResult,
} from '@tanstack/react-query';
import type { ReactNode } from 'react';

/** `E` without what the shells above own: their codes, and every `defined: false` error for `unexpected: true`. */
export type RemainingB<
  E,
  TCodes extends string,
  TUnexpected extends boolean,
> = Exclude<
  Exclude<E, { readonly code: TCodes }>,
  TUnexpected extends true ? { readonly defined: false } : never
>;

/** B: what a shell owns, and what it renders for an owned error. */
export interface ShellSpecB<
  TCodes extends string,
  TUnexpected extends boolean,
> {
  readonly name: string;
  readonly claims: ReadonlyArray<TCodes>;
  readonly unexpected?: TUnexpected;
  readonly fallback: (props: {
    readonly error: unknown;
    readonly reset: () => void;
  }) => ReactNode;
}

/** B: a shell's boundary and hooks, whose `error` is typed without what it and the shells it extends own. */
export interface ShellB<TCodes extends string, TUnexpected extends boolean> {
  readonly name: string;
  readonly Boundary: (props: { readonly children?: ReactNode }) => ReactNode;
  readonly owns: (error: unknown) => boolean;
  useQuery<
    TQueryFnData,
    TError,
    TData = TQueryFnData,
    TQueryKey extends QueryKey = QueryKey,
  >(
    options: UseQueryOptions<TQueryFnData, TError, TData, TQueryKey>,
  ): UseQueryResult<TData, RemainingB<TError, TCodes, TUnexpected>>;
  useMutation<TData, TError, TVariables, TOnMutateResult>(
    options: UseMutationOptions<TData, TError, TVariables, TOnMutateResult>,
  ): UseMutationResult<
    TData,
    RemainingB<TError, TCodes, TUnexpected>,
    TVariables,
    TOnMutateResult
  >;
  extend<const TMore extends string, TMoreUnexpected extends boolean = false>(
    spec: ShellSpecB<TMore, TMoreUnexpected>,
  ): ShellB<TCodes | TMore, TUnexpected extends true ? true : TMoreUnexpected>;
}

/** B: a root shell. */
export declare function createShellB<
  const TCodes extends string,
  TUnexpected extends boolean = false,
>(spec: ShellSpecB<TCodes, TUnexpected>): ShellB<TCodes, TUnexpected>;

/** C: B's spec, or one that reacts to an owned error instead of rendering a fallback. */
export type ShellSpecC<TCodes extends string, TUnexpected extends boolean> =
  | ShellSpecB<TCodes, TUnexpected>
  | (Omit<ShellSpecB<TCodes, TUnexpected>, 'fallback'> & {
      /** Don't throw and don't render a fallback: the hooks' `error` is `null` for owned errors. */
      readonly mode: 'react';
      readonly onError: (
        error: unknown,
        helpers: { readonly retry: () => void },
      ) => void;
    });

/** C: B's shell, extended by either kind of spec. */
export interface ShellC<
  TCodes extends string,
  TUnexpected extends boolean,
> extends Omit<ShellB<TCodes, TUnexpected>, 'extend'> {
  extend<const TMore extends string, TMoreUnexpected extends boolean = false>(
    spec: ShellSpecC<TMore, TMoreUnexpected>,
  ): ShellC<TCodes | TMore, TUnexpected extends true ? true : TMoreUnexpected>;
}

/** C: a root shell. */
export declare function createShellC<
  const TCodes extends string,
  TUnexpected extends boolean = false,
>(spec: ShellSpecB<TCodes, TUnexpected>): ShellC<TCodes, TUnexpected>;

/** D: the claim predicate and the options transform, for an app's own boundary. */
export interface ClaimsD<TCodes extends string> {
  /** Sets `throwOnError` to throw the claimed errors, and types `error` without them. */
  options<TQueryFnData, TError, TData, TQueryKey extends QueryKey>(
    options: UseQueryOptions<TQueryFnData, TError, TData, TQueryKey>,
  ): UseQueryOptions<
    TQueryFnData,
    RemainingB<TError, TCodes, false>,
    TData,
    TQueryKey
  >;
  owns(error: unknown): boolean;
}

/** D: the primitives for codes. */
export declare function claimsD<const TCodes extends string>(spec: {
  readonly claims: ReadonlyArray<TCodes>;
}): ClaimsD<TCodes>;
