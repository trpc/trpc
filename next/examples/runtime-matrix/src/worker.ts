/**
 * A stateless Cloudflare Worker: `handler.fetch` as the Worker's `fetch`,
 * with visits kept in Workers KV. WebSockets on Workers need a Durable
 * Object; `examples/cloudflare` has one. `pnpm dev:worker` runs it locally.
 */
/// <reference types="@cloudflare/workers-types" />
import { env } from 'cloudflare:workers';
import { Effect, Layer } from 'effect';
import { createFetchHandler } from '@trpc12/trpc/server';
import { handlerOptions, Visits } from './router.ts';

interface Env {
  VISITS: KVNamespace;
}

// The handler is created once, outside any request, so its layer reads the
// KV binding from the module's `env` rather than from a request's.
const kvVisits = (kv: KVNamespace) =>
  Layer.succeed(Visits, {
    hit: (page) =>
      Effect.promise(async () => {
        const count = Number((await kv.get(page)) ?? 0) + 1;
        await kv.put(page, String(count));
        return count;
      }),
  });

const handler = createFetchHandler({
  ...handlerOptions,
  layer: kvVisits((env as Env).VISITS),
  createContext: () => ({
    runtime: { name: 'workers', version: navigator.userAgent },
  }),
});

export default {
  fetch: (request) => handler.fetch(request),
} satisfies ExportedHandler<Env>;
