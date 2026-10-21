/**
 * Typed error boundaries: each owns some error codes for the tree under
 * it, so the queries and mutations below type `error` without those codes.
 *
 * @example
 * ```tsx
 * const [RootBoundary] = createErrorBoundary({ name: 'Root', claims: [], unexpected: true, fallback: Crashed });
 * const [AuthBoundary, useAuthBoundary] = createErrorBoundary({
 *   name: 'Auth',
 *   parent: RootBoundary,
 *   claims: ['UNAUTHORIZED'],
 *   fallback: SignIn,
 * });
 *
 * function DocTitle(props: { id: string }) {
 *   const trpc = useTrpc();
 *   const auth = useAuthBoundary();
 *   const doc = useQuery(auth.query(trpc.doc.byId.queryOptions({ input: { id: props.id } })));
 *   // doc.error: the procedure's errors without UNAUTHORIZED and every `defined: false` one
 * }
 * ```
 * @module
 */
import {
  QueryErrorResetBoundary,
  useQueryErrorResetBoundary,
} from '@tanstack/react-query';
import type {
  InfiniteOptionsOut,
  MutationOptionsOut,
  QueryOptionsOut,
} from '@trpc12/tanstack-query';
import { isTrpcError } from '@trpc12/trpc/client';
import {
  Component,
  createContext,
  createElement,
  useContext,
  type ReactNode,
} from 'react';

/**
 * `E` without what an error boundary and the boundaries above it own: the
 * errors with one of `TCodes`, and every `defined: false` error when
 * `TUnexpected`.
 * @since 0.1.0
 * @stability unstable
 */
export type Remaining<
  E,
  TCodes extends string,
  TUnexpected extends boolean,
> = Exclude<
  Exclude<E, { readonly code: TCodes }>,
  TUnexpected extends true ? { readonly defined: false } : never
>;

/**
 * What an error boundary's `fallback` gets: the owned error, and `reset`,
 * which clears the boundary and refetches the failed queries under it.
 * @since 0.1.0
 * @stability unstable
 */
export interface ErrorBoundaryFallbackProps {
  readonly error: unknown;
  readonly reset: () => void;
}

declare const owned: unique symbol;

/**
 * An error boundary's component: it renders `fallback` for the errors it
 * claims, and re-throws the rest to the boundaries above it.
 * @since 0.1.0
 * @stability unstable
 */
export interface ErrorBoundaryComponent<
  TCodes extends string,
  TUnexpected extends boolean,
> {
  (props: { readonly children?: ReactNode }): ReactNode;
  /** Type-only: what this boundary and the boundaries above it own. */
  readonly [owned]: {
    readonly codes: TCodes;
    readonly unexpected: TUnexpected;
  };
}

/**
 * What an error boundary owns and what it renders for an owned error.
 * @since 0.1.0
 * @stability unstable
 */
export interface ErrorBoundarySpec<
  TCodes extends string,
  TUnexpected extends boolean,
> {
  /** Names the boundary in error messages and React DevTools (`<AuthBoundary>` for `'Auth'`). */
  readonly name: string;
  /** The codes this boundary owns, whatever `defined` says. */
  readonly claims: ReadonlyArray<TCodes>;
  /** Owns every `defined: false` error too: crashes, masked errors, bad responses. */
  readonly unexpected?: TUnexpected;
  readonly fallback: (props: ErrorBoundaryFallbackProps) => ReactNode;
}

type DefinedInitialData<TQueryFnData> = {
  initialData:
    | Exclude<TQueryFnData, undefined>
    | (() => Exclude<TQueryFnData, undefined>);
};

/**
 * What an error boundary's hook returns: transforms for tRPC's options,
 * for TanStack's own hooks. Each sets `throwOnError` to throw the errors
 * this boundary and the ones above it own, as well as what the options'
 * own `throwOnError` throws, and types the options' error without the
 * owned ones.
 * @since 0.1.0
 * @stability unstable
 */
export interface ErrorBoundaryOptions<
  TCodes extends string,
  TUnexpected extends boolean,
> {
  /** For `useQuery`, `useSuspenseQuery`, `useQueries` and `usePrefetchQuery`. */
  query<TQueryFnData, TError, TData>(
    options: QueryOptionsOut<TQueryFnData, TError, TData> &
      DefinedInitialData<TQueryFnData>,
  ): QueryOptionsOut<
    TQueryFnData,
    Remaining<TError, TCodes, TUnexpected>,
    TData
  > &
    DefinedInitialData<TQueryFnData>;
  query<TQueryFnData, TError, TData>(
    options: QueryOptionsOut<TQueryFnData, TError, TData>,
  ): QueryOptionsOut<
    TQueryFnData,
    Remaining<TError, TCodes, TUnexpected>,
    TData
  >;
  /** For `useInfiniteQuery` and `useSuspenseInfiniteQuery`. */
  infiniteQuery<TOutput, TError, TData, TPageParam>(
    options: InfiniteOptionsOut<TOutput, TError, TData, TPageParam>,
  ): InfiniteOptionsOut<
    TOutput,
    Remaining<TError, TCodes, TUnexpected>,
    TData,
    TPageParam
  >;
  /** For `useMutation`. */
  mutation<TInput, TOutput, TError, TOnMutateResult>(
    options: MutationOptionsOut<TInput, TOutput, TError, TOnMutateResult>,
  ): MutationOptionsOut<
    TInput,
    TOutput,
    Remaining<TError, TCodes, TUnexpected>,
    TOnMutateResult
  >;
  /** Whether this boundary or one above it owns `error`. */
  owns(error: unknown): boolean;
}

/**
 * What {@link createErrorBoundary} returns, as a tuple to name freely,
 * like `createTrpcContext`'s: the component, and the hook for its options
 * transforms, which throws outside the component.
 * @since 0.1.0
 * @stability unstable
 */
export type TrpcErrorBoundary<
  TCodes extends string,
  TUnexpected extends boolean,
> = readonly [
  Boundary: ErrorBoundaryComponent<TCodes, TUnexpected>,
  useBoundary: () => ErrorBoundaryOptions<TCodes, TUnexpected>,
];

interface Internal {
  readonly name: string;
  readonly displayName: string;
  readonly parent: Internal | undefined;
  readonly claims: (error: unknown) => boolean;
  readonly owns: (error: unknown) => boolean;
  readonly fallback: (props: ErrorBoundaryFallbackProps) => ReactNode;
}

/** The boundaries mounted above a component, nearest first. */
interface Mounted {
  readonly boundary: Internal;
  readonly parent: Mounted | undefined;
}

const MountedBoundaries = createContext<Mounted | undefined>(undefined);

const internals = new WeakMap<object, Internal>();

const isMounted = (at: Mounted | undefined, boundary: Internal) => {
  for (let m = at; m; m = m.parent) if (m.boundary === boundary) return true;
  return false;
};

interface CatcherProps {
  readonly boundary: Internal;
  readonly above: Mounted | undefined;
  readonly resetQueries: () => void;
  readonly children?: ReactNode;
}

class Catcher extends Component<CatcherProps, { error: unknown }> {
  override state = { error: undefined as unknown };

  static getDerivedStateFromError(error: unknown) {
    return { error };
  }

  override render(): ReactNode {
    const error = this.state.error;
    const boundary = this.props.boundary;
    if (error === undefined) {
      return createElement(
        MountedBoundaries,
        { value: { boundary, parent: this.props.above } },
        this.props.children,
      );
    }
    if (!boundary.claims(error)) throw error;
    return boundary.fallback({
      error,
      reset: () => {
        this.props.resetQueries();
        this.setState({ error: undefined });
      },
    });
  }
}

/**
 * Creates an error boundary that owns some error codes for the tree under
 * it. Its hook returns `query`, `infiniteQuery` and `mutation`, which take
 * tRPC's options for TanStack's own hooks: those throw the errors it or a
 * boundary above it owns to the nearest boundary that claims them, whose
 * `fallback` replaces its subtree, and type `error` without them. A
 * boundary re-throws what it doesn't claim. `parent` is the boundary it
 * sits under, which must be mounted above it. The outermost boundary
 * shares one `QueryErrorResetBoundary` with those inside it, so `reset`
 * refetches.
 *
 * @example
 * ```tsx
 * const [RootBoundary] = createErrorBoundary({ name: 'Root', claims: [], unexpected: true, fallback: Crashed });
 * const [AuthBoundary, useAuthBoundary] = createErrorBoundary({
 *   name: 'Auth',
 *   parent: RootBoundary,
 *   claims: ['UNAUTHORIZED'],
 *   fallback: () => <a href="/sign-in">Sign in</a>,
 * });
 *
 * <RootBoundary>
 *   <AuthBoundary>
 *     <DocTitle />
 *   </AuthBoundary>
 * </RootBoundary>;
 * ```
 * @since 0.1.0
 * @stability unstable
 */
export function createErrorBoundary<
  const TCodes extends string,
  TUnexpected extends boolean = false,
  TParentCodes extends string = never,
  TParentUnexpected extends boolean = false,
>(
  spec: ErrorBoundarySpec<TCodes, TUnexpected> & {
    readonly parent?: ErrorBoundaryComponent<TParentCodes, TParentUnexpected>;
  },
): TrpcErrorBoundary<
  TCodes | TParentCodes,
  TUnexpected extends true ? true : TParentUnexpected
> {
  const parent = spec.parent ? internals.get(spec.parent) : undefined;
  const claims = (error: unknown) =>
    isTrpcError(error) &&
    ((spec.claims as ReadonlyArray<string>).includes(error.code) ||
      (spec.unexpected === true && !error.defined));
  const owns = (error: unknown): boolean =>
    claims(error) || (parent?.owns(error) ?? false);
  const boundary: Internal = {
    name: spec.name,
    displayName: `${spec.name}Boundary`,
    parent,
    claims,
    owns,
    fallback: spec.fallback,
  };

  const Inner = (props: {
    readonly above: Mounted | undefined;
    readonly children?: ReactNode;
  }) =>
    createElement(
      Catcher,
      {
        boundary,
        above: props.above,
        resetQueries: useQueryErrorResetBoundary().reset,
      },
      props.children,
    );
  const Boundary = (props: { readonly children?: ReactNode }) => {
    const above = useContext(MountedBoundaries);
    if (parent && !isMounted(above, parent)) {
      throw new Error(
        `<${boundary.displayName}> needs <${parent.displayName}>, its parent, above it`,
      );
    }
    const inner = createElement(Inner, { above }, props.children);
    // Hooks reset against their nearest QueryErrorResetBoundary, so the
    // outermost boundary makes the one every boundary inside it shares.
    return above
      ? inner
      : createElement(QueryErrorResetBoundary, { children: () => inner });
  };
  Boundary.displayName = boundary.displayName;
  internals.set(Boundary, boundary);

  const throwing =
    <TArgs extends unknown[]>(
      own: boolean | ((error: never, ...args: TArgs) => boolean) | undefined,
    ) =>
    (error: unknown, ...args: TArgs) =>
      owns(error) ||
      (typeof own === 'function' ? own(error as never, ...args) : own === true);
  const transforms: ErrorBoundaryOptions<string, boolean> = {
    query: (options: QueryOptionsOut<unknown, unknown, unknown>) =>
      ({ ...options, throwOnError: throwing(options.throwOnError) }) as never,
    infiniteQuery: (options) =>
      ({ ...options, throwOnError: throwing(options.throwOnError) }) as never,
    mutation: (options) =>
      ({ ...options, throwOnError: throwing(options.throwOnError) }) as never,
    owns,
  };
  const useBoundary = () => {
    if (!isMounted(useContext(MountedBoundaries), boundary)) {
      throw new Error(
        `The ${spec.name} error boundary's hook found no <${boundary.displayName}> above it: wrap the tree in <${boundary.displayName}>`,
      );
    }
    return transforms;
  };
  return [Boundary as never, useBoundary as never];
}
