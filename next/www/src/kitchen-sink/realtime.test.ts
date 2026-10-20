import { createMemoryHistory } from '@tanstack/react-router';
import { createTrpcClient, httpLink, routerType } from '@trpc12/trpc/client';
import { describe, expect, it, vi } from '@effect/vitest';

import type { AppRouter } from '../../samples/kitchen-sink-realtime/src/server.ts';
import { buildDemo } from './app.ts';
import { createNetwork, type DemoNetwork } from './network.ts';
import realtime from './realtime.ts';

async function realtimeApp() {
  // A page has one: Effect's HTTP client resolves `url: '/trpc'` against it.
  vi.stubGlobal('location', { origin: 'https://trpc.io', pathname: '/' });
  const app = await buildDemo(realtime, realtime.files);
  const network = createNetwork(app.server);
  network.latency = 0;
  return { app, network };
}

/** A client signed in as `user`, as the demo's `trpc.ts` makes one. */
function clientOf(network: DemoNetwork, user: string) {
  return createTrpcClient({
    router: routerType<AppRouter>(),
    links: [
      httpLink({
        url: '/trpc',
        fetch: network.fetchAs(user),
        headers: { authorization: `Bearer ${user}` },
        reconnect: { delay: () => 0 },
      }),
    ],
  });
}

/** Reads `iterator`'s next value, failing if the subscription ended. */
async function next<T>(iterator: AsyncIterator<T>) {
  const result = await iterator.next();
  if (result.done) {
    throw new Error('The subscription ended');
  }
  return result.value;
}

describe('the realtime demo', () => {
  it('runs a browser per user, with every file of its sample in the editor', () => {
    expect(realtime.users).toEqual(['ada', 'grace']);
    expect(realtime.files.map((file) => file.name)).toContain(realtime.open);
    expect(realtime.files.map((file) => file.name)).toContain(realtime.entry);
  });

  it("replays the room's history, then delivers each message as it's sent", async () => {
    const demo = await realtimeApp();
    const ada = clientOf(demo.network, 'ada');
    const grace = clientOf(demo.network, 'grace');
    const messages = grace.room.messages
      .subscribe({ room: 'general' })
      [Symbol.asyncIterator]();
    expect((await next(messages)).data).toMatchObject({ from: 'trpc' });

    await ada.room.send.mutate({ room: 'general', text: '  hi grace ' });
    await ada.room.send.mutate({ room: 'random', text: 'elsewhere' });
    await ada.room.send.mutate({ room: 'general', text: 'still here?' });
    expect((await next(messages)).data).toMatchObject({
      from: 'ada',
      text: 'hi grace',
    });
    expect((await next(messages)).data).toMatchObject({ text: 'still here?' });
    await messages.return?.();
  });

  it('lists who has the room open, and drops them when they close it', async () => {
    const demo = await realtimeApp();
    const adaOnline = clientOf(demo.network, 'ada')
      .room.online.subscribe({ room: 'general' })
      [Symbol.asyncIterator]();
    expect(await next(adaOnline)).toEqual(['ada']);

    const graceOnline = clientOf(demo.network, 'grace')
      .room.online.subscribe({ room: 'general' })
      [Symbol.asyncIterator]();
    expect(await next(graceOnline)).toEqual(['ada', 'grace']);
    expect(await next(adaOnline)).toEqual(['ada', 'grace']);

    await graceOnline.return?.();
    expect(await next(adaOnline)).toEqual(['ada']);
    await adaOnline.return?.();
  });

  it('resumes a dropped subscription after its last event, without repeats', async () => {
    const demo = await realtimeApp();
    const ada = clientOf(demo.network, 'ada');
    const messages = clientOf(demo.network, 'grace')
      .room.messages.subscribe({ room: 'general' })
      [Symbol.asyncIterator]();
    const welcome = await next(messages);

    demo.network.dropConnections();
    await ada.room.send.mutate({ room: 'general', text: 'while you were out' });
    const missed = await next(messages);
    expect(missed.data.text).toBe('while you were out');
    expect(Number(missed.id)).toBeGreaterThan(Number(welcome.id));
    const subscriptions = demo.network.requests.filter((request) =>
      request.path.startsWith('/trpc/room.messages'),
    );
    expect(subscriptions.map((request) => request.outcome)).toEqual([
      'failed',
      'pending',
    ]);
    expect(subscriptions[1]?.headers).toContain(`last-event-id: ${welcome.id}`);
    await messages.return?.();
  });

  it("starts each browser's app in the general room", async () => {
    const demo = await realtimeApp();
    const router = demo.app.getRouter({
      fetch: demo.network.fetchAs('ada'),
      history: createMemoryHistory({ initialEntries: [realtime.start] }),
      user: 'ada',
    });
    await router.load();
    expect(router.state.status).toBe('idle');
    expect(router.state.matches.at(-1)).toMatchObject({
      params: { room: 'general' },
      routeId: '/rooms/$room',
    });
    expect(router.options.context).toMatchObject({ user: 'ada' });
  });
});
