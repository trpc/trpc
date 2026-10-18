import {
  QueryErrorResetBoundary,
  useMutation,
  useQuery,
  useQueryErrorResetBoundary,
  type QueryKey,
  type UseMutationOptions,
  type UseMutationResult,
  type UseQueryOptions,
  type UseQueryResult,
} from '@tanstack/react-query';
import { isTrpcError } from '@trpc12/trpc/client';
import {
  Component,
  createContext,
  createElement,
  useContext,
  type ContextType,
  type ReactNode,
} from 'react';
import type { Closed } from '../closed-errors/closed.ts';

/** What a shell owns: codes, and optionally every `defined: false` error. */
export interface ShellSpec<TCodes extends string, TUnexpected extends boolean> {
  readonly name: string;
  readonly claims: ReadonlyArray<TCodes>;
  readonly unexpected?: TUnexpected;
  readonly fallback: (props: {
    readonly error: unknown;
    readonly reset: () => void;
  }) => ReactNode;
}

/** `E` without what the shells above own. */
export type Remaining<
  E,
  TCodes extends string,
  TUnexpected extends boolean,
> = Exclude<
  Exclude<E, { readonly code: TCodes }>,
  TUnexpected extends true ? { readonly defined: false } : never
>;

export interface Shell<TCodes extends string, TUnexpected extends boolean> {
  readonly name: string;
  readonly Boundary: (props: { readonly children?: ReactNode }) => ReactNode;
  /** The claims of this shell and every shell it extends. */
  readonly owns: (error: unknown) => boolean;
  useQuery<
    TQueryFnData,
    TError,
    TData = TQueryFnData,
    TQueryKey extends QueryKey = QueryKey,
  >(
    options: UseQueryOptions<TQueryFnData, TError, TData, TQueryKey>,
  ): UseQueryResult<TData, Remaining<Closed<TError>, TCodes, TUnexpected>>;
  useMutation<TData, TError, TVariables, TOnMutateResult>(
    options: UseMutationOptions<TData, TError, TVariables, TOnMutateResult>,
  ): UseMutationResult<
    TData,
    Remaining<Closed<TError>, TCodes, TUnexpected>,
    TVariables,
    TOnMutateResult
  >;
  extend<TMore extends string, TMoreUnexpected extends boolean = false>(
    spec: ShellSpec<TMore, TMoreUnexpected>,
  ): Shell<TCodes | TMore, TUnexpected extends true ? true : TMoreUnexpected>;
}

interface Mounted {
  readonly shell: Shell<string, boolean>;
  readonly parent: Mounted | undefined;
}

const MountedShell = createContext<Mounted | undefined>(undefined);

const mounted = (at: Mounted | undefined, shell: Shell<string, boolean>) => {
  for (let m = at; m; m = m.parent) if (m.shell === shell) return true;
  return false;
};

interface BoundaryProps {
  readonly shell: Shell<string, boolean>;
  readonly spec: ShellSpec<string, boolean>;
  readonly resetQueries: () => void;
  readonly children?: ReactNode;
}

class ShellBoundary extends Component<BoundaryProps, { error: unknown }> {
  static override contextType = MountedShell;
  declare context: ContextType<typeof MountedShell>;
  override state = { error: undefined as unknown };

  static getDerivedStateFromError(error: unknown) {
    return { error };
  }

  override render(): ReactNode {
    const error = this.state.error;
    if (error === undefined) {
      return createElement(
        MountedShell.Provider,
        { value: { shell: this.props.shell, parent: this.context } },
        this.props.children,
      );
    }
    if (!claimedHere(this.props.spec, error)) throw error;
    return this.props.spec.fallback({
      error,
      reset: () => {
        this.props.resetQueries();
        this.setState({ error: undefined });
      },
    });
  }
}

const claimedHere = (spec: ShellSpec<string, boolean>, error: unknown) =>
  isTrpcError(error) &&
  (spec.claims.includes(error.code) ||
    (spec.unexpected === true && !error.defined));

function makeShell(
  spec: ShellSpec<string, boolean>,
  parent: Shell<string, boolean> | undefined,
): Shell<string, boolean> {
  const owns = (error: unknown): boolean =>
    claimedHere(spec, error) || (parent?.owns(error) ?? false);
  const useOwned = (hook: string) => {
    const at = useContext(MountedShell);
    for (const required of chains.get(shell) ?? []) {
      if (!mounted(at, required)) {
        throw new Error(
          `${spec.name}.${hook} needs <${required.name}.Boundary> above it`,
        );
      }
    }
    return owns;
  };
  const Inner = (props: { readonly children?: ReactNode }) =>
    createElement(
      ShellBoundary,
      { shell, spec, resetQueries: useQueryErrorResetBoundary().reset },
      props.children,
    );
  const shell: Shell<string, boolean> = {
    name: spec.name,
    owns,
    // Hooks reset against their nearest QueryErrorResetBoundary, so the
    // outermost shell makes the one every shell inside it shares.
    Boundary: (props) =>
      useContext(MountedShell)
        ? createElement(Inner, null, props.children)
        : createElement(QueryErrorResetBoundary, {
            children: () => createElement(Inner, null, props.children),
          }),
    useQuery: (options) => {
      const claimed = useOwned('useQuery');
      return useQuery({
        ...options,
        throwOnError: (error) => claimed(error),
      }) as never;
    },
    useMutation: (options) => {
      const claimed = useOwned('useMutation');
      return useMutation({
        ...options,
        throwOnError: (error) => claimed(error),
      }) as never;
    },
    extend: (more) => makeShell(more, shell) as never,
  };
  chains.set(shell, [shell, ...(parent ? (chains.get(parent) ?? []) : [])]);
  return shell;
}

/** Each shell and the shells it extends, which must all be mounted above its hooks. */
const chains = new WeakMap<
  Shell<string, boolean>,
  ReadonlyArray<Shell<string, boolean>>
>();

/**
 * A shell owns failures for the tree under its `Boundary`. Its hooks throw
 * owned errors to the nearest boundary (which re-throws what it doesn't
 * own), and type `error` without them.
 */
export const createShell = <
  const TCodes extends string,
  TUnexpected extends boolean = false,
>(
  spec: ShellSpec<TCodes, TUnexpected>,
): Shell<TCodes, TUnexpected> =>
  makeShell(spec as ShellSpec<string, boolean>, undefined) as never;
