import { createCollection } from '@tanstack/db';
import { liveCollectionOptions } from '../client/liveCollectionOptions';
import { createLiveMuxClient } from '../client/liveMuxClient';
import { plain, setup, type Transport } from './setup';

function setupMux(transport: Transport) {
  const ctx = setup(transport);
  // Feed names, inputs and row types are inferred from `client.live`.
  const mux = createLiveMuxClient({ procedure: ctx.client.live });

  const listA = createCollection(
    liveCollectionOptions({
      id: 'todos-a',
      getKey: (todo) => todo.id,
      transport: mux.feed('todos', { listId: 'a' }),
    }),
  );
  const listB = createCollection(
    liveCollectionOptions({
      id: 'todos-b',
      getKey: (todo) => todo.id,
      transport: mux.feed('todos', { listId: 'b' }),
    }),
  );
  const users = createCollection(
    liveCollectionOptions({
      id: 'users',
      getKey: (user) => user.id,
      transport: mux.feed('users', {}),
    }),
  );
  return { ctx, mux, listA, listB, users };
}

describe.each<Transport>(['ws', 'sse'])('pooled live queries over %s', (transport) => {
  test('many collections share one subscription', async () => {
    const { ctx, mux, listA, listB, users } = setupMux(transport);
    await using _ctx = ctx;

    await Promise.all([listA.preload(), listB.preload(), users.preload()]);

    expect(plain(listA.toArray).map((t) => t.id)).toEqual(['t1', 't2']);
    expect(plain(listB.toArray).map((t) => t.id)).toEqual(['t3']);
    expect(plain(users.toArray)).toEqual(ctx.db.users.rows());

    // Three collections, one pooled stream on the server (and, over SSE, one
    // EventSource on the client).
    expect(mux.openCount).toBe(1);
    expect(ctx.stats.openMuxStreams).toBe(1);
    expect(ctx.stats.feedStarts).toEqual([
      { feed: 'todos', since: null },
      { feed: 'todos', since: null },
      { feed: 'users', since: null },
    ]);

    ctx.db.users.mutate((tx) => tx.update(2, { name: 'Nick L' }));
    ctx.db.todos.mutate((tx) => tx.update('t3', { listId: 'a' }));

    await vi.waitFor(() => {
      expect(users.get(2)?.name).toBe('Nick L');
      expect(plain(listA.toArray).map((t) => t.id)).toEqual(['t1', 't2', 't3']);
      expect(listB.size).toBe(0);
    });

    await Promise.all([listA.cleanup(), listB.cleanup(), users.cleanup()]);
    await vi.waitFor(() => expect(ctx.stats.openMuxStreams).toBe(0));
  });

  test('changing the set of queries resumes the others with deltas', async () => {
    const { ctx, mux, listA, listB, users } = setupMux(transport);
    await using _ctx = ctx;

    await Promise.all([listA.preload(), users.preload()]);
    expect(mux.openCount).toBe(1);

    ctx.db.todos.mutate((tx) => tx.update('t1', { text: 'edited' }));
    await vi.waitFor(() => expect(listA.utils.getVersion()).toBe(1));

    // Adding a collection reopens the pooled stream once...
    await listB.preload();
    await vi.waitFor(() => expect(ctx.stats.openMuxStreams).toBe(1));
    expect(mux.openCount).toBe(2);

    // ...and the already-synced feeds resume from their versions rather than
    // being re-snapshotted.
    expect(ctx.stats.feedStarts.slice(2)).toEqual([
      { feed: 'todos', since: 1 },
      { feed: 'users', since: 0 },
      { feed: 'todos', since: null },
    ]);
    expect(listA.get('t1')?.text).toBe('edited');

    await Promise.all([listA.cleanup(), listB.cleanup(), users.cleanup()]);
  });

  test('a dropped connection resumes every pooled query at once', async () => {
    const { ctx, listA, users } = setupMux(transport);
    await using _ctx = ctx;

    await Promise.all([listA.preload(), users.preload()]);
    ctx.db.todos.mutate((tx) => tx.update('t2', { done: true }));
    await vi.waitFor(() => expect(listA.utils.getVersion()).toBe(1));

    ctx.destroyConnections();
    ctx.db.todos.mutate((tx) => tx.update('t1', { done: false }));
    ctx.db.users.mutate((tx) => tx.insert({ id: 3, name: 'Julius' }));

    await vi.waitFor(
      () => {
        expect(listA.get('t1')?.done).toBe(false);
        expect(users.get(3)?.name).toBe('Julius');
      },
      { timeout: 5_000 },
    );

    // The reconnect carried the composite cursor in `lastEventId`.
    expect(ctx.stats.feedStarts.slice(-2)).toEqual([
      { feed: 'todos', since: 1 },
      { feed: 'users', since: 0 },
    ]);

    await Promise.all([listA.cleanup(), users.cleanup()]);
  });
});
