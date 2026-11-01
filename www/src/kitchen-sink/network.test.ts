import { createTrpcClient, httpLink, routerType } from '@trpc12/trpc/client';
import {
  createFetchHandler,
  experimental_Publisher,
  initTrpc,
} from '@trpc12/trpc/server';
import { describe, expect, it, vi } from '@effect/vitest';
import { Effect, Stream } from 'effect';

import { createNetwork } from './network.ts';

class Feed extends experimental_Publisher.Service<Feed, { posts: string }>()(
  'Feed',
) {}

/** A feed whose subscribers the server counts, through the network. */
function feedApp() {
  // A page has one: Effect's HTTP client resolves `url: '/trpc'` against it.
  vi.stubGlobal('location', { origin: 'https://trpc.io', pathname: '/' });
  const server = { watching: 0 };
  const t = initTrpc();
  const router = t.router({
    post: t.procedure.mutation(() => Feed.publish('posts', 'hello')),
    feed: t.procedure.subscription((opts) =>
      Stream.unwrap(
        Effect.sync(() => {
          server.watching++;
          return Feed.subscribe('posts', { lastEventId: opts.lastEventId });
        }),
      ).pipe(Stream.ensuring(Effect.sync(() => server.watching--))),
    ),
  });
  const network = createNetwork(
    createFetchHandler({ router, layer: Feed.memory({ buffer: 10 }) }),
  );
  network.latency = 0;
  const client = createTrpcClient({
    router: routerType<typeof router>(),
    links: [
      httpLink({
        url: '/trpc',
        fetch: network.fetchAs('ada'),
        reconnect: { delay: () => 0 },
      }),
    ],
  });
  return { client, network, server };
}

/** Reads `iterator`'s next value, failing instead of waiting forever. */
async function next<T>(iterator: AsyncIterator<T>) {
  const result = await iterator.next();
  if (result.done) {
    throw new Error('The subscription ended');
  }
  return result.value;
}

function until(check: () => boolean) {
  return vi.waitUntil(check, { interval: 5 });
}

describe('the network', () => {
  it("logs a subscription's events as they arrive, and who sent it", async () => {
    const app = feedApp();
    const controller = new AbortController();
    const events = app.client.feed
      .subscribe(undefined, { signal: controller.signal })
      [Symbol.asyncIterator]();
    const first = next(events);
    await until(() => app.network.connections === 1);
    await app.client.post.mutate();
    expect(await first).toMatchObject({ data: 'hello' });
    const feed = app.network.requests[0];
    expect(feed).toMatchObject({
      from: 'ada',
      method: 'GET',
      outcome: 'pending',
      path: '/trpc/feed',
      status: 200,
    });
    expect(feed?.headers).toContain('accept: text/event-stream');
    expect(feed?.response).toContain('"hello"');

    controller.abort();
    await until(() => app.server.watching === 0);
    expect(app.network.connections).toBe(0);
    expect(app.network.requests[0]?.outcome).toBe('aborted');
  });

  it('drops open subscriptions, which end on the server and resume from their last id', async () => {
    const app = feedApp();
    const events = app.client.feed.subscribe()[Symbol.asyncIterator]();
    const first = next(events);
    await until(() => app.server.watching === 1);
    await app.client.post.mutate();
    const seen = await first;

    app.network.dropConnections();
    expect(app.network.requests[0]).toMatchObject({ outcome: 'failed' });
    await app.client.post.mutate();
    const missed = await next(events);
    expect(Number(missed.id)).toBe(Number(seen.id) + 1);
    expect(app.server.watching).toBe(1);
    const resumed = app.network.requests.filter(
      (request) => request.path === '/trpc/feed',
    );
    expect(resumed.map((request) => request.outcome)).toEqual([
      'failed',
      'pending',
    ]);
    expect(resumed[1]?.headers).toContain(`last-event-id: ${seen.id}`);
    await events.return?.();
  });
});
