/**
 * The router every runtime serves. Nothing in it knows where it runs: the
 * runtime arrives as `ctx`, and storage as the `Visits` service, which each
 * entry point provides with a layer.
 */
import { Context, Effect, Layer } from 'effect';
import { cors } from '@trpc12/trpc/http';
import { experimental_createProgressiveJson } from '@trpc12/trpc/transformer';
import { error, initTrpc, tracked } from '@trpc12/trpc/server';
import { z } from 'zod';

export interface Runtime {
  name: string;
  version: string;
  /** Lambda's request id, from the platform argument. */
  requestId?: string | undefined;
}

/** Counts visits per page: in memory on a server, in KV on Workers. */
export class Visits extends Context.Service<
  Visits,
  { readonly hit: (page: string) => Effect.Effect<number> }
>()('Visits') {
  static readonly memory: Layer.Layer<Visits> = Layer.sync(Visits, () => {
    const counts = new Map<string, number>();
    return {
      hit: (page) =>
        Effect.sync(() => {
          const count = (counts.get(page) ?? 0) + 1;
          counts.set(page, count);
          return count;
        }),
    };
  });
}

// `countdown` waits for `release` between its two items. A runtime that
// buffers the response sends nothing until the wait times out, so the
// client can't release it and sees 'timed out'.
const released = new Set<string>();
const waiting = new Map<string, () => void>();
const gate = (id: string, ms: number) =>
  new Promise<boolean>((resolve) => {
    if (released.delete(id)) return resolve(true);
    const timer = setTimeout(() => {
      waiting.delete(id);
      resolve(false);
    }, ms);
    waiting.set(id, () => {
      clearTimeout(timer);
      resolve(true);
    });
  });

const t = initTrpc<{ ctx: { runtime: Runtime } }>();

export const appRouter = t.router({
  runtime: t.procedure.query((opts) => opts.ctx.runtime),
  greet: t.procedure
    .input(z.object({ name: z.string() }))
    .query((opts) => `hello ${opts.input.name} from ${opts.ctx.runtime.name}`),
  post: t.procedure
    .input(z.object({ id: z.string() }))
    .query((opts) =>
      opts.input.id === '1'
        ? { id: '1', title: 'One router, every runtime' }
        : error({ code: 'NOT_FOUND', data: { id: opts.input.id } }),
    ),
  /** Dates and Maps survive the trip: both ends use progressive JSON. */
  echo: t.procedure
    .input(z.object({ at: z.date(), tags: z.map(z.string(), z.number()) }))
    .mutation((opts) => ({ ...opts.input, by: opts.ctx.runtime.name })),
  upload: t.procedure
    .input(z.object({ file: z.instanceof(File) }))
    .mutation(async (opts) => ({
      name: opts.input.file.name,
      text: await opts.input.file.text(),
    })),
  download: t.procedure.input(z.object({ name: z.string() })).query(
    (opts) =>
      new File([`made on ${opts.ctx.runtime.name}`], opts.input.name, {
        type: 'text/plain',
      }),
  ),
  countdown: t.procedure
    .input(z.object({ id: z.string() }))
    .query(async function* (opts) {
      yield 'first';
      yield (await gate(opts.input.id, 1500)) ? 'released' : 'timed out';
    }),
  release: t.procedure.input(z.object({ id: z.string() })).mutation((opts) => {
    const wake = waiting.get(opts.input.id);
    waiting.delete(opts.input.id);
    if (wake) wake();
    else released.add(opts.input.id);
  }),
  /** Events after `lastEventId`, so a client that reconnects resumes. */
  ticks: t.procedure.subscription(async function* (opts) {
    for (let id = Number(opts.lastEventId ?? 0) + 1; id <= 3; id++) {
      yield tracked(String(id), { id });
    }
  }),
  visit: t.procedure.input(z.object({ page: z.string() })).mutation((opts) =>
    Effect.gen(function* () {
      const visits = yield* Visits;
      return yield* visits.hit(opts.input.page);
    }),
  ),
});
export type AppRouter = typeof appRouter;

export const transformer = experimental_createProgressiveJson();
export const allowedOrigin = 'https://app.example.com';

/** What every entry point passes `createFetchHandler`, besides its context and layer. */
export const handlerOptions = {
  router: appRouter,
  batch: true,
  transformer,
  middleware: [cors({ allowedOrigins: [allowedOrigin] })],
};
