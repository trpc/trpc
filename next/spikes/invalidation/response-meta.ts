/**
 * Spike, second round (decision declared-invalidation-later): links that
 * need something from a link further down the chain say so, and the chain
 * is checked. Here the need is the HTTP response, which `httpLink` would
 * always offer in the core change this prototypes: `responseHttpLink`
 * stands in for it, handing each call's response to the `onResponse`
 * callback in that call's `op.context`.
 *
 * Nothing here is decided API.
 */
import {
  httpLink,
  link,
  type HttpLinkOptions,
  type Operation,
  type OperationStream,
  type TrpcLink,
} from '@trpc12/trpc/client';
import { Deferred, Effect, Stream } from 'effect';

/** What a response-providing link reports for a call. */
export interface ResponseMeta {
  readonly status: number;
  readonly headers: Headers;
}

/** The call option a provider calls; the needing link sets it. */
export interface ResponseContext {
  readonly onResponse?: (meta: ResponseMeta) => void;
}

/** Type-only: what a link offers to the links before it, and what it needs. */
export interface Capabilities<
  TProvides extends string = never,
  TNeeds extends string = never,
> {
  readonly '~capabilities'?: {
    readonly provides: TProvides;
    readonly needs: TNeeds;
  };
}

type ProvidesOf<L> = L extends Capabilities<infer P, any> ? P : never;
type NeedsOf<L> = L extends Capabilities<any, infer N> ? N : never;

export interface ChainError<TNeed extends string> {
  readonly '~typeError': `chain: a link needs '${TNeed}' from a link after it`;
}

/**
 * `unknown` when every link's needs are provided by a link after it. A link
 * reads what's below it, so a provider before the needing link doesn't count.
 */
export type CheckChain<
  TLinks extends ReadonlyArray<unknown>,
  TBelow extends string = never,
> = TLinks extends readonly [...infer Rest, infer Last]
  ? [Exclude<NeedsOf<Last>, TBelow>] extends [never]
    ? CheckChain<Rest, TBelow | ProvidesOf<Last>>
    : ChainError<Exclude<NeedsOf<Last>, TBelow> & string>
  : unknown;

/** A typed links array: the chain check runs on it. */
export const chain = <const TLinks extends ReadonlyArray<TrpcLink<any>>>(
  ...links: TLinks & CheckChain<TLinks>
): TLinks => links;

const ON_RESPONSE = '~onResponse';

/**
 * `httpLink`, plus a report of each call's response to `onResponse`. The
 * callback rides in the call's `init`, which `httpLink` passes to `fetch` as
 * it is; an `init` holding a function is batched apart.
 */
export function responseHttpLink(
  opts: HttpLinkOptions,
): TrpcLink<{ context: ResponseContext }> & Capabilities<'response'> {
  const baseFetch = opts.fetch ?? globalThis.fetch;
  const fetch: typeof globalThis.fetch = async (input, init) => {
    const res = await baseFetch(input, init);
    const report = (init as Record<string, unknown> | undefined)?.[
      ON_RESPONSE
    ] as ResponseContext['onResponse'];
    report?.({ status: res.status, headers: res.headers });
    return res;
  };
  const inner = httpLink({ ...opts, fetch });
  return link<{ context: ResponseContext }>(({ op, next }) => {
    const onResponse = op.context.onResponse;
    if (!onResponse) return inner({ op, next });
    const init = { ...op.context.init, [ON_RESPONSE]: onResponse };
    return inner({ op: { ...op, context: { ...op.context, init } }, next });
  });
}

/**
 * Runs `op` through the rest of the chain with an `onResponse` callback,
 * and gives the response to `use` once the first value arrives (the client
 * takes it and interrupts, so this can't wait for the stream's end).
 */
export const withResponse = (
  op: Operation,
  next: (op: Operation) => OperationStream,
  use: (meta: ResponseMeta) => Effect.Effect<void>,
): OperationStream =>
  Stream.unwrap(
    Effect.map(Deferred.make<ResponseMeta>(), (response) =>
      next({
        ...op,
        context: {
          ...op.context,
          onResponse: (meta: ResponseMeta) =>
            Deferred.doneUnsafe(response, Effect.succeed(meta)),
        } as Operation['context'],
      }).pipe(
        Stream.tap(() =>
          Effect.suspend(() =>
            Deferred.isDoneUnsafe(response)
              ? Effect.flatMap(Deferred.await(response), use)
              : Effect.void,
          ),
        ),
      ),
    ),
  );
