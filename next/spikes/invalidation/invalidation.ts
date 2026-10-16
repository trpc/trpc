/**
 * Spike (decision declared-invalidation-later): a server extension that
 * declares what a mutation invalidates, and a client link that applies it to
 * a TanStack `QueryClient`.
 *
 * Links only see result streams, not responses, so the server's targets
 * travel in a `trpc-invalidate` response header that the link's `fetch`
 * reads. The link tags each mutation with a ref header to find its response,
 * and sends mutations unbatched, since a batch merges headers.
 *
 * Root-extension middleware runs before the procedure's `.input()`, so it
 * sees no parsed input: targets are computed from the output.
 */
import type { QueryClient } from '@tanstack/query-core';
import { Effect, Stream } from 'effect';
import { link, type TrpcLink } from '@trpc12/trpc/client';
import { initTrpc } from '@trpc12/trpc/server';

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
export const REF_HEADER = 'trpc-invalidation-ref';

/** The server half: `initTrpc().with(invalidation())`. */
export const invalidation = () => {
  const r = initTrpc<{ meta: InvalidationMeta }>({
    mergeMeta: { invalidates: (before, next) => [...before, ...next] },
  });
  return r.procedure.use(
    r.middleware.effect()(({ meta, response, next }) =>
      next().pipe(
        Effect.tap((result) =>
          Effect.sync(() => {
            if (!result.ok || !meta.invalidates?.length) return;
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

export interface InvalidationLink extends TrpcLink {
  /** Pass to `httpLink({ fetch })`, so the link sees the response header. */
  readonly fetch: typeof globalThis.fetch;
}

/** The client half: put it before the `httpLink` whose `fetch` it wraps. */
export function invalidationLink(opts: {
  queryClient: QueryClient;
  fetch?: typeof globalThis.fetch;
}): InvalidationLink {
  const baseFetch = opts.fetch ?? globalThis.fetch;
  const pending = new Map<string, ReadonlyArray<Target>>();
  let nextRef = 0;
  const fetch: typeof globalThis.fetch = async (input, init) => {
    const request = new Request(input, init);
    const ref = request.headers.get(REF_HEADER);
    const res = await baseFetch(request);
    const value = res.headers.get(HEADER);
    if (ref && value) pending.set(ref, JSON.parse(value));
    return res;
  };
  const invalidate = (ref: string) =>
    Effect.promise(async () => {
      const targets = pending.get(ref) ?? [];
      pending.delete(ref);
      await Promise.all(
        targets.map((target) => {
          const { path, input } =
            typeof target === 'string'
              ? { path: target, input: undefined }
              : target;
          // The adapters' key shape, `[path, { input, type }]`; a missing
          // input partially matches every input.
          return opts.queryClient.invalidateQueries({
            queryKey: [
              path.split('.'),
              ...(input === undefined ? [] : [{ input }]),
            ],
          });
        }),
      );
    });
  const self = link(({ op, next }) => {
    if (op.type !== 'mutation') return next(op);
    const ref = String(nextRef++);
    const headers = new Headers(op.context.headers);
    headers.set(REF_HEADER, ref);
    return next({
      ...op,
      context: { ...op.context, headers, batch: false },
    }).pipe(
      // The client takes the first value and interrupts, so this runs on
      // the value, before the caller sees it, not on the stream's end.
      Stream.tap(() => invalidate(ref)),
      Stream.ensuring(Effect.sync(() => pending.delete(ref))),
    );
  });
  return Object.assign(self, { fetch });
}
