/**
 * Stage 1: the server is on v12, the apps aren't. This runs the v11 app's
 * client code from `v11/client/`, unchanged and typed by the v11
 * `AppRouter`, against `createV11Handler` on `/trpc`.
 */
import { deepStrictEqual, ok, strictEqual } from 'node:assert/strict';
import { TRPCClientError } from '@trpc/client';
import { makeClient, makeWsClient } from '../v11/client/client.ts';
import type { CallLog } from '../v11/client/links.ts';
import { makeQueries } from '../v11/client/queries.ts';
import { firstEvents } from './events.ts';

const failure = (promise: Promise<unknown>) =>
  promise.then(
    () => {
      throw new Error('expected the call to fail');
    },
    (err) => {
      ok(err instanceof TRPCClientError, 'a v11 TRPCClientError');
      return err;
    },
  );

export async function run(url: string) {
  const log: CallLog[] = [];
  const client = makeClient({ url, token: 'ada', log });

  // httpBatchLink with superjson: one batch, Dates come back as Dates.
  const [list, first] = await Promise.all([
    client.post.list.query(),
    client.post.byId.query({ id: '1' }),
  ]);
  strictEqual(first.title, 'Hello v11');
  ok(first.createdAt instanceof Date, 'superjson keeps the Date');
  ok(list.some((post) => post.id === '1'));

  // Errors in v11's shape, the errorFormatter's `issues` included.
  const missing = await failure(client.post.byId.query({ id: '404' }));
  deepStrictEqual(
    { code: missing.data?.code, httpStatus: missing.data?.httpStatus },
    { code: 'NOT_FOUND', httpStatus: 404 },
  );
  const invalid = await failure(client.post.add.mutate({ title: '' }));
  strictEqual(invalid.data?.code, 'BAD_REQUEST');
  deepStrictEqual(invalid.data?.issues, ['Give the post a title']);
  const anonymous = makeClient({ url, token: null, log: [] });
  const unauthorized = await failure(
    anonymous.post.add.mutate({ title: 'Nope' }),
  );
  strictEqual(unauthorized.data?.code, 'UNAUTHORIZED');

  // httpSubscriptionLink: v11 sends `lastEventId` in the input; the stream
  // resumes after it, then goes live.
  const added = await client.post.add.mutate({ title: 'From a v11 app' });
  ok(added.createdAt instanceof Date);
  strictEqual(added.author, 'ada');
  const resumed = await firstEvents(
    client.post.onAdd,
    { lastEventId: String(Number(added.id) - 1) },
    2,
    () => client.post.add.mutate({ title: 'Live, to a v11 app' }),
  );
  deepStrictEqual(
    resumed.map((event) => [event.id, event.data.title]),
    [
      [added.id, 'From a v11 app'],
      [String(Number(added.id) + 1), 'Live, to a v11 app'],
    ],
  );
  ok(resumed[0]!.data.createdAt instanceof Date);

  // @trpc/tanstack-react-query 11's options proxy, outside React.
  const queries = makeQueries(client);
  const cached = await queries.queryClient.query(
    queries.trpc.post.byId.queryOptions({ id: added.id }),
  );
  strictEqual(cached.title, 'From a v11 app');
  deepStrictEqual(
    queries.queryClient.getQueryData(
      queries.trpc.post.byId.queryKey({ id: added.id }),
    ),
    cached,
  );

  // wsLink: connectionParams carry the user; createContext runs per message.
  const ws = makeWsClient({ url: url.replace(/^http/, 'ws'), token: 'grace' });
  try {
    const overWs = await ws.client.post.add.mutate({ title: 'Over wsLink' });
    strictEqual(overWs.author, 'grace');
    ok(overWs.createdAt instanceof Date);
    // Resuming after `overWs.id` also catches a post added before the
    // subscription starts.
    const live = firstEvents(
      ws.client.post.onAdd,
      { lastEventId: overWs.id },
      1,
    );
    await client.post.add.mutate({ title: 'Live over wsLink' });
    strictEqual((await live)[0]!.data.title, 'Live over wsLink');
  } finally {
    await ws.close();
  }

  // The app's own TRPCLink saw every call.
  ok(log.some((entry) => entry.path === 'post.list' && entry.ok));
  ok(log.some((entry) => entry.path === 'post.byId' && !entry.ok));
  ok(log.some((entry) => entry.type === 'subscription' && entry.ok));

  console.log('stage 1: v11 clients on /trpc:', {
    posts: list.length,
    missing: missing.message,
    invalid: invalid.data?.issues,
    resumed: resumed.map((event) => event.id),
    calls: log.length,
  });
}
