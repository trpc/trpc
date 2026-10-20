/**
 * Spike (decision declared-invalidation-later): a server extension that
 * declares what a mutation invalidates, and a client link that applies it to
 * a TanStack `QueryClient`.
 *
 * The server's targets travel in a `trpc-invalidate` response header. The
 * first round read it with a `fetch` wrapper and a ref header per mutation;
 * this round reads it from a link after it that reports responses
 * (`./response-meta.ts`).
 *
 * Root-extension middleware runs before the procedure's `.input()`, so it
 * sees no parsed input: targets are computed from the output.
 */
import type { QueryClient } from '@tanstack/query-core';
import { Effect } from 'effect';
import { link, type TrpcLink } from '@trpc12/trpc/client';
import { initTrpc } from '@trpc12/trpc/server';
import { type Capabilities, withResponse } from './response-meta.ts';

/** A path (`'post.list'`), or a path and the input of the one query. */
export type Target =
  | string
  | { readonly path: string; readonly input?: unknown };

export interface InvalidationMeta {
  /**
   * What a successful call invalidates: targets, or functions of the
   * output that return them. `.meta()` calls add to the list.
   */
  invalidates?: ReadonlyArray<
    Target | ((output: any) => ReadonlyArray<Target>)
  >;
}

export const HEADER = 'trpc-invalidate';

/** The server half: `initTrpc().concat(invalidation())`. */
export const invalidation = () => {
  const r = initTrpc<{ meta: InvalidationMeta }>({
    mergeMeta: { invalidates: (before, next) => [...before, ...next] },
  });
  return r.procedure.use(
    r.middleware.effect()(({ meta, response, next }) =>
      next().pipe(
        Effect.tap((result) =>
          Effect.sync(() => {
            if (!meta.invalidates?.length) return;
            const targets = meta.invalidates.flatMap((entry) =>
              typeof entry === 'function' ? entry(result.data) : [entry],
            );
            response.headers.set(HEADER, JSON.stringify(targets));
          }),
        ),
      ),
    ),
  );
};

const invalidateTargets = (
  queryClient: QueryClient,
  targets: ReadonlyArray<Target>,
) =>
  Effect.promise(() =>
    Promise.all(
      targets.map((target) => {
        const { path, input } =
          typeof target === 'string'
            ? { path: target, input: undefined }
            : target;
        // The adapters' key shape, `[path, { input, type }]`; a missing
        // input partially matches every input.
        return queryClient.invalidateQueries({
          queryKey: [
            path.split('.'),
            ...(input === undefined ? [] : [{ input }]),
          ],
        });
      }),
    ),
  );

/**
 * The client half. It needs `'response'` from a link after it
 * (`responseHttpLink` here; `httpStreamLink` in the core change), which `chain()`
 * checks, and reads the `trpc-invalidate` header from the response it
 * reports. No ref header, no `fetch` wrapper, and batching is up to the
 * provider.
 */
export function invalidationLink(opts: {
  queryClient: QueryClient;
}): TrpcLink & Capabilities<never, 'response'> {
  return link(({ op, next }) =>
    op.type !== 'mutation'
      ? next(op)
      : withResponse(op, next, (response) => {
          const value = response.headers.get(HEADER);
          return value
            ? Effect.asVoid(
                invalidateTargets(opts.queryClient, JSON.parse(value)),
              )
            : Effect.void;
        }),
  );
}
