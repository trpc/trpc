import type { LiveMessage } from '../protocol';
import { LiveTable } from '../server/liveTable';

interface Row {
  id: number;
  group: string;
  value: number;
}

function createTable(historySize?: number) {
  return new LiveTable<Row, number>({
    getKey: (row) => row.id,
    historySize,
    initialRows: [
      { id: 1, group: 'a', value: 1 },
      { id: 2, group: 'b', value: 2 },
    ],
  });
}

/** Pull messages from a feed until `count` have arrived */
async function take<T>(iterator: AsyncIterator<T>, count: number) {
  const out: T[] = [];
  while (out.length < count) {
    const next = await iterator.next();
    if (next.done) break;
    out.push(next.value);
  }
  return out;
}

test('a fresh subscriber gets a snapshot, then change bursts', async () => {
  const table = createTable();
  const ac = new AbortController();
  const feed = table.live({ since: null, signal: ac.signal });

  const [snapshot] = await take(feed, 1);
  expect(snapshot).toEqual({
    kind: 'snapshot',
    version: 0,
    rows: [
      { id: 1, group: 'a', value: 1 },
      { id: 2, group: 'b', value: 2 },
    ],
  });

  const v1 = table.mutate((tx) => tx.update(1, { value: 10 }));
  const v2 = table.mutate((tx) => tx.insert({ id: 3, group: 'a', value: 3 }));
  expect([v1, v2]).toEqual([1, 2]);

  // Both commits landed before the consumer pulled again, so they coalesce.
  const [burst] = await take(feed, 1);
  expect(burst).toEqual({
    kind: 'changes',
    version: 2,
    changes: [
      { type: 'update', value: { id: 1, group: 'a', value: 10 } },
      { type: 'insert', value: { id: 3, group: 'a', value: 3 } },
    ],
  });

  ac.abort();
  expect((await feed.next()).done).toBe(true);
  expect(table.subscriberCount).toBe(0);
});

test('a resuming subscriber within history gets only the missed deltas', async () => {
  const table = createTable();
  table.mutate((tx) => tx.update(1, { value: 10 }));
  table.mutate((tx) => tx.delete(2));
  table.mutate((tx) => tx.insert({ id: 3, group: 'a', value: 3 }));

  const ac = new AbortController();
  const [catchUp] = await take(table.live({ since: 1, signal: ac.signal }), 1);
  expect(catchUp).toEqual({
    kind: 'changes',
    version: 3,
    changes: [
      { type: 'delete', key: 2 },
      { type: 'insert', value: { id: 3, group: 'a', value: 3 } },
    ],
  });
  ac.abort();
});

test('a subscriber that fell out of history gets a fresh snapshot', async () => {
  const table = createTable(2);
  for (let i = 0; i < 5; i++) {
    table.mutate((tx) => tx.update(1, { value: i }));
  }

  const ac = new AbortController();
  const [message] = await take(table.live({ since: 1, signal: ac.signal }), 1);
  expect(message!.kind).toBe('snapshot');
  expect(message!.version).toBe(5);
  ac.abort();
});

test('a subscriber ahead of the server (e.g. server restarted) gets a snapshot', async () => {
  const table = createTable();
  const ac = new AbortController();
  const [message] = await take(table.live({ since: 42, signal: ac.signal }), 1);
  expect(message).toMatchObject({ kind: 'snapshot', version: 0 });
  ac.abort();
});

test('a filtered subscriber sees rows entering and leaving its shape', async () => {
  const table = createTable();
  const ac = new AbortController();
  const feed = table.live({
    since: null,
    signal: ac.signal,
    where: (row) => row.group === 'a',
  });

  const [snapshot] = await take(feed, 1);
  expect(snapshot).toMatchObject({ rows: [{ id: 1 }] });

  table.mutate((tx) => {
    tx.update(2, { group: 'a' }); // enters
    tx.update(1, { group: 'b' }); // leaves
  });
  const [burst] = await take(feed, 1);
  expect(burst).toEqual({
    kind: 'changes',
    version: 1,
    changes: [
      { type: 'insert', value: { id: 2, group: 'a', value: 2 } },
      { type: 'delete', key: 1 },
    ],
  });
  ac.abort();
});

test('writes outside the shape still advance the cursor', async () => {
  const table = createTable();
  const ac = new AbortController();
  const feed = table.live({
    since: null,
    signal: ac.signal,
    where: (row) => row.group === 'a',
  });
  await take(feed, 1);

  const version = table.mutate((tx) =>
    tx.insert({ id: 9, group: 'z', value: 0 }),
  );
  const [burst] = await take(feed, 1);
  expect(burst).toEqual<LiveMessage<Row, number>>({
    kind: 'changes',
    version,
    changes: [],
  });
  ac.abort();
});

test('a failing mutation commits nothing', () => {
  const table = createTable();
  expect(() =>
    table.mutate((tx) => {
      tx.insert({ id: 3, group: 'a', value: 3 });
      tx.insert({ id: 1, group: 'a', value: 1 });
    }),
  ).toThrow(/already exists/);
  expect(table.version).toBe(0);
  expect(table.get(3)).toBeUndefined();
});
