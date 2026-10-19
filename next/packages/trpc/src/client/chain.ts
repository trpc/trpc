/**
 * What the Promise client needs to run a link chain, without Effect: Promise
 * links, the registries `createTrpcClient` reads, and the hand-off to
 * Effect links. A chain of Promise links bundles no Effect; the first
 * Effect link (one made with `link()`) brings the runtime with it.
 *
 * @internal
 */
import {
  isTrpcError,
  toBuiltinError,
  TrpcError,
  type AnyTrpcError,
} from '../internal/error.ts';
import type { AnySerializer } from '../serializer/index.ts';
import type { LinkDecl, Operation, DeclContext, TrpcLink } from './link.ts';

/**
 * What a Promise link returns: the value of a query or mutation, or a
 * subscription's events.
 * @since 0.1.0
 * @stability stable
 */
export type PromiseLinkResult = Promise<unknown> | AsyncIterable<unknown>;

/**
 * What a Promise link receives.
 * @since 0.1.0
 * @stability stable
 */
export interface PromiseLinkOpts<TContext extends object = {}> {
  readonly op: Operation<TContext>;
  /** The rest of the chain: a `Promise` for queries and mutations, an `AsyncIterable` for subscriptions. */
  readonly next: (op: Operation) => PromiseLinkResult;
}

/**
 * A link written with Promises (no Effect): a function from an operation and
 * the rest of the chain to a `Promise` (queries, mutations) or an
 * `AsyncIterable` (subscriptions). `httpLink` is one. Make your own with
 * {@link promiseLink}.
 * @since 0.1.0
 * @stability stable
 */
export interface PromiseLink<TDecl extends LinkDecl = {}, TRouter = any> {
  (opts: PromiseLinkOpts): PromiseLinkResult;
  /** Type-only, as on `TrpcLink`. */
  readonly '~types'?: {
    readonly decl: (decl: TDecl) => TDecl;
    readonly router: TRouter;
  };
}

/**
 * Any link, Effect or Promise, whatever it declares.
 * @since 0.1.0
 * @stability stable
 */
export type AnyLink = TrpcLink<any, any> | PromiseLink<any, any>;

/** What a link, Effect or Promise, declares. @internal */
export type LinkDeclOf<TLink> = TLink extends {
  readonly '~types'?: { readonly decl: (decl: infer D) => unknown };
}
  ? D
  : never;

/**
 * Marks a Promise link, so an Effect chain (`createEffectClient`,
 * `splitLink`'s branches) runs it as one. @internal
 */
export const PROMISE_LINK: unique symbol = Symbol.for(
  '@trpc12/trpc/promise-link',
);

/** Whether `l` was made with `promiseLink()`. @internal */
export const isPromiseLink = (l: AnyLink): l is PromiseLink<any, any> =>
  PROMISE_LINK in l;

/**
 * Creates a Promise link: call `next(op)` for the rest of the chain. Return
 * its result unchanged for subscriptions (an `AsyncIterable`, so not from an
 * `async` function), or a replacement.
 *
 * @example
 * ```ts
 * const authLink = promiseLink(({ op, next }) =>
 *   next({ ...op, context: { ...op.context, headers: { authorization: getToken() } } }),
 * );
 * ```
 * @since 0.1.0
 * @stability stable
 */
export const promiseLink = <TDecl extends LinkDecl = {}>(
  fn: (opts: PromiseLinkOpts<DeclContext<TDecl>>) => PromiseLinkResult,
): PromiseLink<TDecl> =>
  Object.assign(fn, { [PROMISE_LINK]: true }) as PromiseLink<TDecl>;

/** Runs `links[i..]` for the Promise client. @internal */
export type EffectRunner = (
  links: ReadonlyArray<AnyLink>,
  i: number,
  op: Operation,
) => PromiseLinkResult;

/**
 * Marks an Effect link with the function that runs it, and the links after
 * it, for the Promise client. `link()` sets it. @internal
 */
export const EFFECT_RUNNER: unique symbol = Symbol.for(
  '@trpc12/trpc/effect-runner',
);

/** Whether `l` is an Effect link (made with `link()`). @internal */
export const effectRunnerOf = (l: AnyLink): EffectRunner | undefined =>
  (l as { [EFFECT_RUNNER]?: EffectRunner })[EFFECT_RUNNER];

/**
 * Runs `op` through `links[i..]`: Promise links in turn, and from the first
 * Effect link on, the Effect runtime that link brought.
 * @internal
 */
export function runChain(
  links: ReadonlyArray<AnyLink>,
  i: number,
  op: Operation,
): PromiseLinkResult {
  const current = links[i];
  if (!current) {
    throw new TrpcError({
      code: 'CLIENT_ERROR',
      message: 'The last link must send the request (e.g. httpLink)',
    });
  }
  const run = effectRunnerOf(current);
  if (run) return run(links, i, op);
  const result = (current as PromiseLink)({
    op,
    next: (o) => runChain(links, i + 1, o),
  });
  if (
    typeof result === 'object' &&
    result !== null &&
    '~effect/Stream' in result
  ) {
    throw new TypeError(
      'A link returned an Effect Stream: make Effect links with link()',
    );
  }
  return result;
}

/**
 * Runs a query or mutation through `links`. It settles with
 * `CLIENT_CLOSED_REQUEST` once `op.signal` aborts, whatever the links do.
 * @internal
 */
export function runRequest(
  links: ReadonlyArray<AnyLink>,
  op: Operation,
): Promise<unknown> {
  const { signal } = op;
  const aborted = () =>
    new TrpcError({
      code: 'CLIENT_CLOSED_REQUEST',
      message: 'The request was aborted',
    });
  if (!signal) return Promise.resolve().then(() => runChain(links, 0, op));
  if (signal.aborted) return Promise.reject(aborted());
  return new Promise((resolve, reject) => {
    const abort = () => reject(aborted());
    signal.addEventListener('abort', abort, { once: true });
    Promise.resolve()
      .then(() => runChain(links, 0, op))
      .then(resolve, reject)
      .finally(() => signal.removeEventListener('abort', abort));
  });
}

/**
 * Turns anything a link threw into a client error: a defined error, or a
 * built-in one with no `data`. An undeclared custom code is `CLIENT_ERROR`.
 * @internal
 */
export function toClientError(cause: unknown): AnyTrpcError {
  if (isTrpcError(cause)) return toBuiltinError(cause, 'CLIENT_ERROR');
  return new TrpcError({
    code: 'CLIENT_ERROR',
    message: cause instanceof Error ? cause.message : String(cause),
    cause,
  });
}

const serializers = new WeakMap<AnyLink, AnySerializer>();

/** Records the serializer a link sends with. @internal */
export function withSerializer<L extends AnyLink>(
  target: L,
  serializer: AnySerializer | undefined,
): L {
  if (serializer) serializers.set(target, serializer);
  return target;
}

/** The first serializer a chain records, looking into split branches. @internal */
export function chainSerializer(
  links: ReadonlyArray<AnyLink>,
): AnySerializer | undefined {
  for (const current of links) {
    const found = serializers.get(current);
    if (found) return found;
  }
  return undefined;
}

const switchNames = new WeakMap<AnyLink, ReadonlySet<string>>();

/** Records the `switchLink` names a link contains. @internal */
export function setSwitchNames(target: AnyLink, names: Iterable<string>): void {
  switchNames.set(target, new Set(names));
}

/**
 * The `switchLink` names in a chain. Throws when two links on the chain
 * use the same one, since one call option would force both. @internal
 */
export function chainSwitchNames(links: ReadonlyArray<AnyLink>): Set<string> {
  const names = new Set<string>();
  for (const current of links) {
    for (const name of switchNames.get(current) ?? []) {
      if (names.has(name)) {
        throw new TypeError(`Two switchLinks on one chain are named "${name}"`);
      }
      names.add(name);
    }
  }
  return names;
}
