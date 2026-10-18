/**
 * Stage 2: the client moves to v12 and to the v12 endpoint, `/rpc`. The
 * app's own v11 `TRPCLink` runs in the v12 chain through `fromV11Link`.
 */
import { deepStrictEqual, ok, strictEqual } from 'node:assert/strict';
import { safe } from '@trpc12/trpc/client';
import { makeClient } from '../client/client.ts';
import { makeQueries } from '../client/queries.ts';
import type { CallLog } from '../v11/client/links.ts';

export async function run(url: string) {
  const log: CallLog[] = [];
  const client = makeClient({ url, token: 'ada', log });

  // One batch, and createSyncSerializer(superjson) keeps the Dates.
  const [list, first] = await Promise.all([
    client.post.list.query(),
    client.post.byId.query({ id: '1' }),
  ]);
  strictEqual(first.title, 'Hello v11');
  ok(first.createdAt instanceof Date, 'superjson keeps the Date');
  ok(list.length > 1, 'stage 1 added posts');

  // v12 errors: a code, and declared data; no errorFormatter.
  const [, missing] = await safe(client.post.byId.query({ id: '404' }));
  strictEqual(missing?.code, 'NOT_FOUND');
  const [, invalid] = await safe(client.post.add.mutate({ title: '' }));
  ok(invalid?.code === 'BAD_REQUEST' && invalid.defined);
  deepStrictEqual(
    invalid.data.issues.map((issue) => issue.message),
    ['Give the post a title'],
  );
  const anonymous = makeClient({ url, token: null, log: [] });
  const [, unauthorized] = await safe(
    anonymous.post.add.mutate({ title: 'Nope' }),
  );
  strictEqual(unauthorized?.code, 'UNAUTHORIZED');

  // httpLink subscribes over SSE; lastEventId is a call option now.
  const added = await client.post.add.mutate({ title: 'From the v12 client' });
  strictEqual(added.author, 'ada');
  const events: Array<[string, string]> = [];
  for await (const event of client.post.onAdd.subscribe(undefined, {
    lastEventId: String(Number(added.id) - 1),
  })) {
    ok(event.data.createdAt instanceof Date);
    events.push([event.id, event.data.title]);
    if (events.length === 2) break;
    await client.post.add.mutate({ title: 'Live, to the v12 client' });
  }
  deepStrictEqual(events, [
    [added.id, 'From the v12 client'],
    [String(Number(added.id) + 1), 'Live, to the v12 client'],
  ]);

  // @trpc12/tanstack-react-query: the input goes in `{ input }`.
  const queries = makeQueries(client);
  const cached = await queries.queryClient.query(
    queries.trpc.post.byId.queryOptions({ input: { id: added.id } }),
  );
  strictEqual(cached.title, 'From the v12 client');
  deepStrictEqual(
    queries.queryClient.getQueryData(
      queries.trpc.post.byId.queryKey({ input: { id: added.id } }),
    ),
    cached,
  );

  // The v11 link saw v12 calls: it gets v11 operations and observables.
  ok(log.some((entry) => entry.path === 'post.list' && entry.ok));
  ok(log.some((entry) => entry.path === 'post.byId' && !entry.ok));
  ok(log.some((entry) => entry.type === 'subscription' && entry.ok));

  console.log('stage 2: the v12 client on /rpc:', {
    posts: list.length,
    missing: missing?.message,
    resumed: events.map((event) => event[0]),
    calls: log.length,
  });
}
