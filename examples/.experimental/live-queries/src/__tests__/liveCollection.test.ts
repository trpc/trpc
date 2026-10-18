import { createCollection, createLiveQueryCollection, eq } from '@tanstack/db';
import { liveCollectionOptions } from '../client/liveCollectionOptions';
import { liveSubscription } from '../client/transport';
import type { Todo } from '../server/router';
import { plain, setup, type Transport } from './setup';

function createTodoCollection(
  ctx: ReturnType<typeof setup>,
  input: { listId?: string } = {},
) {
  return createCollection(
    liveCollectionOptions({
      id: `todos-${input.listId ?? 'all'}`,
      getKey: (todo) => todo.id,
      // Row and key types are inferred from the router's subscription output.
      transport: liveSubscription(ctx.client.todos.live, input),
      onInsert: async ({ transaction, collection }) => {
        const { version } = await ctx.client.todos.create.mutate(
          transaction.mutations.map((m) => m.modified),
        );
        await collection.utils.awaitVersion(version);
      },
      onUpdate: async ({ transaction, collection }) => {
        const { version } = await ctx.client.todos.update.mutate(
          transaction.mutations.map((m) => ({
            id: m.key,
            patch: m.changes,
          })),
        );
        await collection.utils.awaitVersion(version);
      },
      onDelete: async ({ transaction, collection }) => {
        const { version } = await ctx.client.todos.delete.mutate(
          transaction.mutations.map((m) => m.key),
        );
        await collection.utils.awaitVersion(version);
      },
    }),
  );
}

describe.each<Transport>(['ws', 'sse'])('live collection over %s', (transport) => {
  test('loads the snapshot and follows server-side writes', async () => {
    await using ctx = setup(transport);
    const todos = createTodoCollection(ctx);

    expect(plain(await todos.toArrayWhenReady())).toEqual(ctx.db.todos.rows());
    expect(todos.utils.getVersion()).toBe(0);
    expect(ctx.wss.clients.size).toBe(transport === 'ws' ? 1 : 0);

    // A write made by someone else, straight against the server's table
    ctx.db.todos.mutate((tx) => {
      tx.update('t2', { done: true });
      tx.delete('t3');
    });

    await vi.waitFor(() => {
      expect(todos.get('t2')?.done).toBe(true);
      expect(todos.has('t3')).toBe(false);
    });
    expect(todos.utils.getVersion()).toBe(1);

    await todos.cleanup();
  });

  test('optimistic writes are confirmed by the live stream, not a refetch', async () => {
    await using ctx = setup(transport);
    const todos = createTodoCollection(ctx);
    await todos.preload();

    const newTodo: Todo = { id: 't9', listId: 'a', text: 'Optimistic', done: false };
    const tx = todos.insert(newTodo);

    // Visible immediately, before the server has seen it
    expect(todos.get('t9')).toMatchObject({ ...newTodo, $hasPendingWrites: true });

    await tx.isPersisted.promise;

    // By the time the transaction settles, the server's row has arrived over
    // the subscription and replaced the optimistic one.
    expect(ctx.db.todos.get('t9')).toEqual(newTodo);
    expect(todos.get('t9')).toMatchObject({ ...newTodo, $hasPendingWrites: false });
    expect(todos.utils.getVersion()).toBe(ctx.db.todos.version);

    const updateTx = todos.update('t9', (draft) => {
      draft.done = true;
    });
    await updateTx.isPersisted.promise;
    expect(ctx.db.todos.get('t9')?.done).toBe(true);

    const deleteTx = todos.delete('t9');
    await deleteTx.isPersisted.promise;
    expect(ctx.db.todos.get('t9')).toBeUndefined();
    expect(todos.has('t9')).toBe(false);

    await todos.cleanup();
  });

  test('a rejected mutation rolls the optimistic row back', async () => {
    await using ctx = setup(transport);
    const todos = createTodoCollection(ctx);
    await todos.preload();

    const tx = todos.insert({ id: 't9', listId: 'a', text: 'mine', done: false });
    // Another writer claims the same id before our mutation reaches the server
    ctx.db.todos.mutate((other) =>
      other.insert({ id: 't9', listId: 'b', text: 'theirs', done: true }),
    );

    await expect(tx.isPersisted.promise).rejects.toThrow(/already exists/);
    await vi.waitFor(() => {
      expect(plain([todos.get('t9')!])).toEqual([
        { id: 't9', listId: 'b', text: 'theirs', done: true },
      ]);
    });

    await todos.cleanup();
  });

  test('server-side shapes and client-side live queries compose', async () => {
    await using ctx = setup(transport);
    // Only list `a` is replicated to the client...
    const listA = createTodoCollection(ctx, { listId: 'a' });
    // ...and a TanStack DB live query narrows it further, locally.
    const openInA = createLiveQueryCollection((q) =>
      q.from({ todo: listA }).where(({ todo }) => eq(todo.done, false)),
    );

    expect(plain(await listA.toArrayWhenReady()).map((t) => t.id)).toEqual(['t1', 't2']);
    expect(plain(await openInA.toArrayWhenReady()).map((t) => t.id)).toEqual(['t2']);

    ctx.db.todos.mutate((tx) => {
      tx.update('t3', { listId: 'a' }); // moves into the shape
      tx.update('t2', { done: true }); // drops out of the local query
    });

    await vi.waitFor(() => {
      expect(plain(listA.toArray).map((t) => t.id)).toEqual(['t1', 't2', 't3']);
      expect(plain(openInA.toArray).map((t) => t.id)).toEqual(['t3']);
    });

    await openInA.cleanup();
    await listA.cleanup();
  });

  test('a dropped connection resumes from the last version, not a new snapshot', async () => {
    await using ctx = setup(transport);
    const todos = createTodoCollection(ctx);
    await todos.preload();

    ctx.db.todos.mutate((tx) => tx.update('t1', { text: 'before drop' }));
    await vi.waitFor(() => expect(todos.utils.getVersion()).toBe(1));

    ctx.destroyConnections();
    ctx.db.todos.mutate((tx) => tx.update('t1', { text: 'while offline' }));

    await vi.waitFor(
      () => expect(todos.get('t1')?.text).toBe('while offline'),
      { timeout: 5_000 },
    );
    expect(todos.utils.getVersion()).toBe(2);
    // First connect asked for a snapshot; the reconnect asked for deltas.
    expect(ctx.stats.liveStarts[0]).toBe(null);
    expect(ctx.stats.liveStarts.at(-1)).toBe(1);

    await todos.cleanup();
  });

  test('a client that fell out of history is healed with a snapshot', async () => {
    await using ctx = setup(transport, { historySize: 1 });
    const todos = createTodoCollection(ctx);
    await todos.preload();

    ctx.destroyConnections();
    ctx.db.todos.mutate((tx) => tx.delete('t1'));
    ctx.db.todos.mutate((tx) => tx.insert({ id: 't4', listId: 'b', text: 'x', done: false }));

    await vi.waitFor(
      () => expect(plain(todos.toArray)).toEqual(plain(ctx.db.todos.rows())),
      { timeout: 5_000 },
    );
    expect(todos.has('t1')).toBe(false);

    await todos.cleanup();
  });
});
