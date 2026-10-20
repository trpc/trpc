import { MutationObserver, QueryClient } from '@tanstack/react-query';
import { createMemoryHistory } from '@tanstack/react-router';
import { describe, expect, it, vi } from '@effect/vitest';

import {
  addTodoOptions,
  toggleTodoOptions,
} from '../../samples/kitchen-sink-optimistic/src/optimistic.ts';
import {
  type AppContext,
  createTrpc,
} from '../../samples/kitchen-sink-optimistic/src/trpc.ts';
import { buildDemo } from './app.ts';
import { createNetwork } from './network.ts';
import optimistic from './optimistic.ts';

async function optimisticApp() {
  // A page has one: Effect's HTTP client resolves `url: '/trpc'` against it.
  vi.stubGlobal('location', { origin: 'https://trpc.io', pathname: '/' });
  const app = await buildDemo(optimistic, optimistic.files);
  const network = createNetwork(app.server);
  network.latency = 0;
  const queryClient = new QueryClient();
  const ctx: AppContext = { ...createTrpc(network.fetch), queryClient };
  const key = ctx.trpc.todo.list.queryKey();
  await queryClient.query(ctx.trpc.todo.list.queryOptions());
  const todos = () => queryClient.getQueryData(key) ?? [];
  /** Resolves once the cached list passes `check`, as the page would see it. */
  const cached = (check: (list: ReturnType<typeof todos>) => boolean) =>
    new Promise<void>((resolve) => {
      const stop = queryClient.getQueryCache().subscribe(() => {
        if (check(todos())) {
          stop();
          resolve();
        }
      });
    });
  return {
    app,
    cached,
    ctx,
    key,
    network,
    texts: () => todos().map((todo) => todo.text),
  };
}

const seeded = ['Read the tRPC docs', 'Try Fail next request'];

describe('the optimistic demo', () => {
  it('shows a new todo before the server has it, then settles the list', async () => {
    const demo = await optimisticApp();
    demo.network.latency = 20;
    const add = new MutationObserver(
      demo.ctx.queryClient,
      addTodoOptions(demo.ctx),
    );
    const saved = add.mutate({ id: 'new', text: 'Ship it' });
    await demo.cached((list) => list.some((todo) => todo.id === 'new'));
    // `onMutate` runs before the call is sent.
    expect(demo.network.requests.map((request) => request.path)).toEqual([
      '/trpc/todo.list',
    ]);
    expect(await saved).toEqual({ done: false, id: 'new', text: 'Ship it' });
    expect(demo.ctx.queryClient.getQueryState(demo.key)?.isInvalidated).toBe(
      true,
    );
    expect(await demo.ctx.client.todo.list.query()).toContainEqual({
      done: false,
      id: 'new',
      text: 'Ship it',
    });
  });

  it('takes the todo back when the network drops the call', async () => {
    const demo = await optimisticApp();
    demo.network.latency = 20;
    demo.network.failNext();
    const add = new MutationObserver(
      demo.ctx.queryClient,
      addTodoOptions(demo.ctx),
    );
    const failed = add.mutate({ id: 'new', text: 'Ship it' });
    await demo.cached((list) => list.some((todo) => todo.id === 'new'));
    expect(demo.texts()).toContain('Ship it');
    await expect(failed).rejects.toMatchObject({ code: 'NETWORK_ERROR' });
    expect(demo.texts()).toEqual(seeded);
  });

  it("takes it back when the server rejects its text, with the schema's issue", async () => {
    const demo = await optimisticApp();
    const add = new MutationObserver(
      demo.ctx.queryClient,
      addTodoOptions(demo.ctx),
    );
    const err = await add
      .mutate({ id: 'new', text: 'x'.repeat(31) })
      .catch((cause: unknown) => cause);
    expect(err).toMatchObject({
      code: 'BAD_REQUEST',
      data: { issues: [{ message: 'At most 30 characters', path: ['text'] }] },
    });
    expect(demo.texts()).toEqual(seeded);
  });

  it('ticks at once, and unticks when the call fails', async () => {
    const demo = await optimisticApp();
    demo.network.latency = 20;
    demo.network.failNext();
    const toggle = new MutationObserver(
      demo.ctx.queryClient,
      toggleTodoOptions(demo.ctx),
    );
    const done = () =>
      demo.ctx.queryClient
        .getQueryData(demo.key)
        ?.find((todo) => todo.id === 'seed-2')?.done;
    const failed = toggle.mutate({ done: true, id: 'seed-2' });
    await demo.cached(() => done() === true);
    await expect(failed).rejects.toMatchObject({ code: 'NETWORK_ERROR' });
    expect(done()).toBe(false);
  });

  it("loads the list in the root route's loader", async () => {
    const demo = await optimisticApp();
    const router = demo.app.getRouter({
      fetch: demo.network.fetch,
      history: createMemoryHistory({ initialEntries: [optimistic.start] }),
    });
    await router.load();
    expect(router.state.status).toBe('idle');
    expect(demo.network.requests.map((request) => request.path)).toEqual([
      '/trpc/todo.list',
      '/trpc/todo.list',
    ]);
  });
});
