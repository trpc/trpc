/**
 * The typings `.agent-docs/open/response-batch-false-message.md` proposes:
 * B puts a hint naming the fix in the required options of a call that
 * can't be batched; C drops the check, so such calls compile on a
 * batching chain. A is `httpLink` as it is.
 */
import type { HttpLinkOptions, TrpcLink, httpLink } from '@trpc12/trpc/client';

type DeclOf<L> = L extends TrpcLink<infer D> ? D : never;

type Hint<P extends string> = {
  readonly [K in `${P} may return a Response: pass { batch: false }`]: never;
};

type Join<P extends string, K> = P extends ''
  ? K & string
  : `${P}.${K & string}`;

/** B: a client whose calls that must pass `{ batch: false }` name it when an options object lacks it. */
export type BatchHintClientB<TClient, P extends string = ''> = {
  [K in keyof TClient]: TClient[K] extends {
    query(...args: infer A extends [unknown, ...unknown[]]): infer R;
  }
    ? [A[0]] extends A
      ? TClient[K]
      : {
          query<O extends Omit<A[1], 'batch'> & { batch?: false }>(
            input: A[0],
            opts: O & (O extends { batch: false } ? {} : Hint<Join<P, K>>),
          ): R;
        }
    : BatchHintClientB<TClient[K], Join<P, K>>;
};

/** C: `httpLink`, which batches without making `{ batch: false }` a required option. */
export declare function httpLinkC<TOpts extends HttpLinkOptions>(
  opts: TOpts,
): TrpcLink<Omit<DeclOf<ReturnType<typeof httpLink<TOpts>>>, 'batches'>>;
