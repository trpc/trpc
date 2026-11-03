/**
 * Type-safe error boundaries: each claims some errors of a router by code
 * or tag, with a fallback per claim typed by exactly the errors it gets,
 * and the queries and mutations under it type `error` without them.
 *
 * @example
 * ```tsx
 * const [AuthBoundary, useAuthBoundary] = createErrorBoundary({
 *   name: 'Auth',
 *   errors: makeClient,
 *   claims: { UNAUTHORIZED: (props) => <SignIn onSignedIn={props.reset} /> },
 * });
 *
 * function DocTitle(props: { id: string }) {
 *   const trpc = useTrpc();
 *   const auth = useAuthBoundary();
 *   const doc = useQuery(auth.query(trpc.doc.byId.queryOptions({ input: { id: props.id } })));
 *   // doc.error: the procedure's errors without UNAUTHORIZED
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
  SourceContext,
  SourceLinks,
  SourceRouter,
} from '@trpc12/tanstack-query';
import {
  isTrpcError,
  type RouterOf,
  type TrpcClient,
} from '@trpc12/trpc/client';
import {
  Activity,
  Component,
  createContext,
  createElement,
  Fragment,
  useContext,
  useMemo,
  type ErrorInfo,
  type ReactNode,
} from 'react';

/** The errors every procedure under a client's (or router's) node fails with. */
type ErrorsIn<T> = T extends {
  query(...args: never): { readonly '~error'?: infer E };
}
  ? E
  : T extends { mutate(...args: never): { readonly '~error'?: infer E } }
    ? E
    : T extends { subscribe(...args: never): { readonly '~error'?: infer E } }
      ? E
      : T extends object
        ? { [K in keyof T & string]: ErrorsIn<T[K]> }[keyof T & string]
        : never;

/**
 * Every error a client's calls can fail with, as its calls type them:
 * `TSource` is the client factory's type (`typeof makeClient`), the
 * client's, or a router type, as `createTrpcContext<TSource>()` takes.
 * @since 0.1.0
 * @stability unstable
 */
export type ErrorsOf<TSource> = ErrorsIn<
  TrpcClient<
    RouterOf<SourceRouter<TSource>>,
    SourceContext<TSource>,
    undefined,
    SourceLinks<TSource>
  >
>;

type KeysOf<E> = E extends {
  readonly code: infer C extends string;
  readonly _tag: infer T extends string;
}
  ? C | T
  : never;

/**
 * What a boundary over errors `E` can claim: a code (`'UNAUTHORIZED'`), a
 * tag (`'ProcedureNotFound'`), or `'unexpected'`, everything no other
 * boundary owns.
 * @since 0.1.0
 * @stability unstable
 */
export type ClaimKey<E> = Exclude<KeysOf<E>, `~${string}`> | 'unexpected';

/**
 * The errors of `E` a boundary claiming `TKeys` renders `K`'s fallback for:
 * those tagged `K`, and those with code `K` that no claimed tag takes
 * first. `'unexpected'`'s is `unknown`, since it takes any throw.
 * @since 0.1.0
 * @stability unstable
 */
export type ClaimedError<
  E,
  K extends string,
  TKeys extends string,
> = K extends 'unexpected'
  ? unknown
  :
      | Extract<E, { readonly _tag: K }>
      | Exclude<
          Extract<E, { readonly code: K }>,
          { readonly _tag: Exclude<TKeys, K> }
        >;

/**
 * `E` without what an error boundary and the boundaries above it own: the
 * errors whose code or tag is one of `TClaims`, and every `defined: false`
 * error when `TUnexpected`.
 * @since 0.1.0
 * @stability unstable
 */
export type Unclaimed<
  E,
  TClaims extends string,
  TUnexpected extends boolean,
> = Exclude<
  E,
  | { readonly code: TClaims }
  | { readonly _tag: TClaims }
  | (TUnexpected extends true ? { readonly defined: false } : never)
>;

/**
 * What a claim's fallback gets: the error, typed by the claim, and `reset`,
 * which clears the boundary, refetches the failed queries under it and
 * sends its held mutations again.
 * @since 0.1.0
 * @stability unstable
 */
export interface ErrorBoundaryFallbackProps<TError> {
  readonly error: TError;
  readonly reset: () => void;
}

/**
 * One fallback component per claim, each typed by the errors it gets.
 * @since 0.1.0
 * @stability unstable
 */
export type ErrorBoundaryClaims<E, TKeys extends string> = {
  readonly [K in TKeys]: (
    props: ErrorBoundaryFallbackProps<ClaimedError<E, K, TKeys>>,
  ) => ReactNode;
};

/**
 * Why a boundary reset: its fallback called `reset()`, or a `resetKeys`
 * entry changed.
 * @since 0.1.0
 * @stability unstable
 */
export type ErrorBoundaryResetDetails =
  | { readonly reason: 'reset' }
  | {
      readonly reason: 'keys';
      readonly prev: ReadonlyArray<unknown> | undefined;
      readonly next: ReadonlyArray<unknown> | undefined;
    };

/**
 * Props of a boundary's component, with react-error-boundary's names.
 * @since 0.1.0
 * @stability unstable
 */
export interface ErrorBoundaryProps<TCaught> {
  readonly children?: ReactNode;
  /** Resets the boundary when an entry changes, by `Object.is`. */
  readonly resetKeys?: ReadonlyArray<unknown> | undefined;
  readonly onReset?: ((details: ErrorBoundaryResetDetails) => void) | undefined;
  /** For each error this boundary renders a fallback for, not those it passes up. */
  readonly onError?: ((error: TCaught, info: ErrorInfo) => void) | undefined;
}

declare const owned: unique symbol;

/**
 * An error boundary's component: it renders a claim's fallback for the
 * errors it claims, and re-throws the rest to the boundaries above it.
 * @since 0.1.0
 * @stability unstable
 */
export interface ErrorBoundaryComponent<
  TClaims extends string,
  TUnexpected extends boolean,
  TCaught = unknown,
> {
  (props: ErrorBoundaryProps<TCaught>): ReactNode;
  readonly displayName: string;
  /** Type-only: what this boundary and the boundaries above it own. */
  readonly [owned]: {
    readonly claims: TClaims;
    readonly unexpected: TUnexpected;
  };
}

/**
 * What {@link createErrorBoundary} takes.
 * @since 0.1.0
 * @stability unstable
 */
export interface ErrorBoundarySpec<TSource, TKeys extends string> {
  /** Names the boundary in error messages and React DevTools (`<AuthBoundary>` for `'Auth'`). */
  readonly name: string;
  /**
   * What the errors come from, for the types only: a client factory, a
   * client, or `routerType<AppRouter>()`.
   */
  readonly errors: TSource;
  /** A fallback per code or tag this boundary owns, and `unexpected` for any other throw. */
  readonly claims: ErrorBoundaryClaims<ErrorsOf<TSource>, TKeys>;
}

type DefinedInitialData<TQueryFnData> = {
  initialData:
    | Exclude<TQueryFnData, undefined>
    | (() => Exclude<TQueryFnData, undefined>);
};

/**
 * What an error boundary's hook returns: transforms for tRPC's options,
 * for TanStack's own hooks, which type the options' error without what
 * this boundary and the ones above it own. A query's owned error throws to
 * the boundary that claims it, as well as what the options' own
 * `throwOnError` throws. A mutation's is held: the mutation stays pending
 * while the boundary shows its fallback, and `reset` sends it again.
 * @since 0.1.0
 * @stability unstable
 */
export interface ErrorBoundaryOptions<
  TClaims extends string,
  TUnexpected extends boolean,
> {
  /** For `useQuery`, `useSuspenseQuery`, `useQueries` and `usePrefetchQuery`. */
  query<TQueryFnData, TError, TData>(
    options: QueryOptionsOut<TQueryFnData, TError, TData> &
      DefinedInitialData<TQueryFnData>,
  ): QueryOptionsOut<
    TQueryFnData,
    Unclaimed<TError, TClaims, TUnexpected>,
    TData
  > &
    DefinedInitialData<TQueryFnData>;
  query<TQueryFnData, TError, TData>(
    options: QueryOptionsOut<TQueryFnData, TError, TData>,
  ): QueryOptionsOut<
    TQueryFnData,
    Unclaimed<TError, TClaims, TUnexpected>,
    TData
  >;
  /** For `useInfiniteQuery` and `useSuspenseInfiniteQuery`. */
  infiniteQuery<TOutput, TError, TData, TPageParam>(
    options: InfiniteOptionsOut<TOutput, TError, TData, TPageParam>,
  ): InfiniteOptionsOut<
    TOutput,
    Unclaimed<TError, TClaims, TUnexpected>,
    TData,
    TPageParam
  >;
  /** For `useMutation`. */
  mutation<TInput, TOutput, TError, TOnMutateResult>(
    options: MutationOptionsOut<TInput, TOutput, TError, TOnMutateResult>,
  ): MutationOptionsOut<
    TInput,
    TOutput,
    Unclaimed<TError, TClaims, TUnexpected>,
    TOnMutateResult
  >;
  /** Whether this boundary or one above it owns `error`. */
  owns(error: unknown): boolean;
}

/**
 * What {@link createErrorBoundary} returns, as a tuple to name
 * freely, like `createTrpcContext`'s: the component, and the hook for its
 * options transforms, which throws outside the component.
 * @since 0.1.0
 * @stability unstable
 */
export type TrpcErrorBoundary<
  TClaims extends string,
  TUnexpected extends boolean,
  TCaught = unknown,
> = readonly [
  Boundary: ErrorBoundaryComponent<TClaims, TUnexpected, TCaught>,
  useBoundary: () => ErrorBoundaryOptions<TClaims, TUnexpected>,
];

type Fallback = (props: ErrorBoundaryFallbackProps<never>) => ReactNode;

interface Internal {
  readonly displayName: string;
  readonly parent: Internal | undefined;
  /** The fallback this boundary renders for a throw that reaches it. */
  readonly fallbackFor: (error: unknown) => Fallback | undefined;
  /** Whether this boundary owns `error`, as its hook's types say. */
  readonly claims: (error: unknown) => boolean;
  readonly owns: (error: unknown) => boolean;
}

/** Where a mounted boundary keeps its held mutations. */
interface Holder {
  hold(error: unknown): Promise<void>;
}

/** The boundaries mounted above a component, nearest first. */
interface Mounted {
  readonly boundary: Internal;
  readonly holder: Holder;
  readonly parent: Mounted | undefined;
}

const MountedBoundaries = /* @__PURE__ */ createContext<Mounted | undefined>(
  undefined,
);

const internals = new WeakMap<object, Internal>();

const isMounted = (at: Mounted | undefined, boundary: Internal) => {
  for (let m = at; m; m = m.parent) if (m.boundary === boundary) return true;
  return false;
};

/** Next's `redirect()` and `notFound()`, which must reach the framework. */
const isControlFlow = (error: unknown) =>
  typeof error === 'object' &&
  error !== null &&
  typeof (error as { digest?: unknown }).digest === 'string';

const changed = (
  prev: ReadonlyArray<unknown> = [],
  next: ReadonlyArray<unknown> = [],
) => prev.length !== next.length || prev.some((k, i) => !Object.is(k, next[i]));

interface CatcherProps extends ErrorBoundaryProps<never> {
  readonly boundary: Internal;
  readonly above: Mounted | undefined;
  readonly resetQueries: () => void;
}

interface CatcherState {
  readonly caught:
    | { readonly error: unknown; readonly held: boolean }
    | undefined;
}

interface Hold {
  readonly resolve: () => void;
  readonly reject: () => void;
}

class Catcher extends Component<CatcherProps, CatcherState> implements Holder {
  override state: CatcherState = { caught: undefined };
  private readonly holds = new Set<Hold>();
  private mounted: Mounted | undefined;

  static getDerivedStateFromError(error: unknown): CatcherState {
    return { caught: { error, held: false } };
  }

  // React calls it only once the fallback rendered, not for an error re-thrown.
  override componentDidCatch(error: unknown, info: ErrorInfo) {
    this.props.onError?.(error as never, info);
  }

  override componentDidUpdate(prev: CatcherProps, prevState: CatcherState) {
    if (
      this.state.caught &&
      prevState.caught &&
      changed(prev.resetKeys, this.props.resetKeys)
    ) {
      this.reset({
        reason: 'keys',
        prev: prev.resetKeys,
        next: this.props.resetKeys,
      });
    }
  }

  override componentWillUnmount() {
    for (const hold of this.holds) hold.reject();
    this.holds.clear();
  }

  hold(error: unknown): Promise<void> {
    return new Promise((resolve, reject) => {
      this.holds.add({ resolve, reject: () => reject(error) });
      this.setState((state) =>
        state.caught ? null : { caught: { error, held: true } },
      );
      this.props.onError?.(error as never, {});
    });
  }

  private reset(details: ErrorBoundaryResetDetails) {
    const holds = [...this.holds];
    this.holds.clear();
    this.props.resetQueries();
    this.setState({ caught: undefined });
    for (const hold of holds) hold.resolve();
    this.props.onReset?.(details);
  }

  override render(): ReactNode {
    const boundary = this.props.boundary;
    const caught = this.state.caught;
    if (!this.mounted || this.mounted.parent !== this.props.above) {
      this.mounted = { boundary, holder: this, parent: this.props.above };
    }
    const fallback = () => {
      const error = caught?.error;
      const Fallback = boundary.fallbackFor(error);
      if (!Fallback) throw error;
      return createElement(Fallback, {
        error: error as never,
        reset: () => this.reset({ reason: 'reset' }),
      });
    };
    if (caught && !caught.held) return fallback();
    const tree = createElement(
      MountedBoundaries,
      { value: this.mounted },
      this.props.children,
    );
    // The tree stays at one position, so hiding it keeps its state.
    return createElement(
      Fragment,
      null,
      createElement(Activity, {
        mode: caught ? 'hidden' : 'visible',
        children: tree,
      }),
      caught ? fallback() : null,
    );
  }
}

/**
 * Creates a type-safe error boundary that claims some of a router's errors
 * by code or tag, with a fallback per claim typed by exactly the errors it
 * gets. Its hook returns `query`, `infiniteQuery` and `mutation`, which take
 * tRPC's options for TanStack's own hooks and type `error` without what
 * this boundary or a boundary above it owns.
 *
 * A query's owned error throws to the nearest boundary that claims it,
 * whose fallback replaces its subtree. A mutation's is held instead: the
 * mutation stays pending and the subtree stays mounted, hidden in React's
 * `<Activity>` while the fallback shows, and `reset` sends it again. A claim is a code, which takes every
 * error with it whatever `defined` says, or a tag, which takes one
 * failure; a tag goes before a code. `unexpected` takes any other throw,
 * crashes while rendering too, but a framework's control flow (an error
 * with a `digest`, like Next's `redirect()`). `parent` is the boundary it
 * sits under, which must be mounted above it. The outermost boundary
 * shares one `QueryErrorResetBoundary` with those inside it, so `reset`
 * refetches.
 *
 * @example
 * ```tsx
 * const makeClient = () => createTrpcClient({ router: routerType<AppRouter>(), links });
 *
 * const [RootBoundary] = createErrorBoundary({
 *   name: 'Root',
 *   errors: makeClient,
 *   claims: { unexpected: (props) => <Crashed onRetry={props.reset} /> },
 * });
 * const [AuthBoundary, useAuthBoundary] = createErrorBoundary({
 *   name: 'Auth',
 *   errors: makeClient,
 *   parent: RootBoundary,
 *   claims: {
 *     UNAUTHORIZED: (props) => <SignIn onSignedIn={props.reset} />,
 *     ProcedureNotFound: () => <button onClick={() => location.reload()}>Update</button>,
 *   },
 * });
 *
 * <RootBoundary>
 *   <AuthBoundary resetKeys={[session.userId]}>
 *     <DocTitle />
 *   </AuthBoundary>
 * </RootBoundary>;
 * ```
 * @since 0.1.0
 * @stability unstable
 */
export function createErrorBoundary<
  TSource,
  const TKeys extends ClaimKey<ErrorsOf<TSource>>,
  TParentClaims extends string = never,
  TParentUnexpected extends boolean = false,
>(
  spec: ErrorBoundarySpec<TSource, TKeys> & {
    /** The boundary it sits under, which must be mounted above it. */
    readonly parent?: ErrorBoundaryComponent<
      TParentClaims,
      TParentUnexpected,
      unknown
    >;
  },
): TrpcErrorBoundary<
  Exclude<TKeys, 'unexpected'> | TParentClaims,
  'unexpected' extends TKeys ? true : TParentUnexpected,
  ClaimedError<ErrorsOf<TSource>, TKeys, TKeys>
> {
  const parent = spec.parent ? internals.get(spec.parent) : undefined;
  const fallbacks: Readonly<Record<string, Fallback | undefined>> = spec.claims;
  const own = (key: string) =>
    key !== 'unexpected' && Object.hasOwn(fallbacks, key)
      ? fallbacks[key]
      : undefined;
  const unexpected = fallbacks['unexpected'];
  const fallbackFor = (error: unknown) =>
    (isTrpcError(error) ? (own(error._tag) ?? own(error.code)) : undefined) ??
    (unexpected && !isControlFlow(error) ? unexpected : undefined);
  const claims = (error: unknown) =>
    isTrpcError(error) &&
    (own(error._tag) !== undefined ||
      own(error.code) !== undefined ||
      (unexpected !== undefined && !error.defined));
  const owns = (error: unknown): boolean =>
    claims(error) || (parent?.owns(error) ?? false);
  const boundary: Internal = {
    displayName: `${spec.name}Boundary`,
    parent,
    fallbackFor,
    claims,
    owns,
  };
  const inChain = (b: Internal) => {
    for (let x: Internal | undefined = boundary; x; x = x.parent) {
      if (x === b) return true;
    }
    return false;
  };

  const Inner = (props: Omit<CatcherProps, 'resetQueries'>) =>
    createElement(Catcher, {
      ...props,
      resetQueries: useQueryErrorResetBoundary().reset,
    });
  const Boundary = (props: ErrorBoundaryProps<never>) => {
    const above = useContext(MountedBoundaries);
    if (parent && !isMounted(above, parent)) {
      throw new Error(
        `<${boundary.displayName}> needs <${parent.displayName}>, its parent, above it`,
      );
    }
    const inner = createElement(Inner, { ...props, boundary, above });
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
      ownThrow:
        | boolean
        | ((error: never, ...args: TArgs) => boolean)
        | undefined,
    ) =>
    (error: unknown, ...args: TArgs) =>
      owns(error) ||
      (typeof ownThrow === 'function'
        ? ownThrow(error as never, ...args)
        : ownThrow === true);
  const transforms = (
    at: Mounted | undefined,
  ): ErrorBoundaryOptions<string, boolean> => {
    const holderFor = (error: unknown) => {
      for (let m = at; m; m = m.parent) {
        if (inChain(m.boundary) && m.boundary.claims(error)) return m.holder;
      }
      return undefined;
    };
    return {
      query: (options: QueryOptionsOut<unknown, unknown, unknown>) =>
        ({ ...options, throwOnError: throwing(options.throwOnError) }) as never,
      infiniteQuery: (options) =>
        ({ ...options, throwOnError: throwing(options.throwOnError) }) as never,
      mutation: (options) =>
        ({
          ...options,
          mutationFn: async (input: never) => {
            for (;;) {
              try {
                return await options.mutationFn(input);
              } catch (error) {
                const holder = holderFor(error);
                if (!holder) throw error;
                await holder.hold(error);
              }
            }
          },
        }) as never,
      owns,
    };
  };
  const useBoundary = () => {
    const at = useContext(MountedBoundaries);
    const options = useMemo(() => transforms(at), [at]);
    if (!isMounted(at, boundary)) {
      throw new Error(
        `The ${spec.name} error boundary's hook found no <${boundary.displayName}> above it: wrap the tree in <${boundary.displayName}>`,
      );
    }
    return options;
  };
  return [Boundary as never, useBoundary as never];
}
