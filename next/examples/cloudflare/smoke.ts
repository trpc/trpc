/**
 * Runs the Worker locally with Wrangler (workerd), then calls a room over
 * HTTP, subscribes to it over a hibernating WebSocket and resumes a durable
 * streamed call whose connection drops. With `SMOKE_URL` set, it checks a
 * deployed Worker instead. `pnpm dev` serves it for a browser.
 */
import {
  createTrpcClient,
  experimental_durableLink,
  httpLink,
  splitLink,
  wsLink,
  routerType,
} from '@trpc12/trpc/client';
import { unstable_startWorker } from 'wrangler';
import type { AppRouter } from './src/router.ts';

const deployed = process.env['SMOKE_URL'];
const worker = deployed
  ? undefined
  : await unstable_startWorker({
      config: new URL('./wrangler.jsonc', import.meta.url).pathname,
      dev: { server: { port: 0 }, inspector: false, logLevel: 'warn' },
    });
try {
  await worker?.ready;
  const base = deployed ?? (await worker!.url);
  // A room per run, so a deployed object starts empty.
  const room = deployed ? `smoke-${Date.now()}` : 'lobby';
  const url = new URL(`/rooms/${room}/trpc`, base).href;
  const ws = wsLink({ url: url.replace(/^http/, 'ws') });
  const client = createTrpcClient({
    router: routerType<AppRouter>(),
    links: [
      splitLink({
        condition: (op) => op.type === 'subscription',
        true: ws,
        false: httpLink({ url }),
      }),
    ],
  });

  console.log('room:', await client.room.query());

  // Two rooms are two objects; the seat's lock is shared by both.
  const other = createTrpcClient({
    router: routerType<AppRouter>(),
    links: [
      httpLink({ url: url.replace(`/rooms/${room}/`, `/rooms/${room}-2/`) }),
    ],
  });
  if (!deployed) {
    await fetch(
      new URL('/cdn-cgi/local/explorer/api/local/observability/clear', base),
      {
        method: 'POST',
      },
    );
  }
  const seat = `a1-${Date.now()}`;
  const claims = await Promise.all([
    client.claim.mutate({ seat, by: 'ada' }),
    new Promise((r) => setTimeout(r, 20)).then(() =>
      other.claim.mutate({ seat, by: 'grace' }),
    ),
  ]);
  console.log('claim:', claims);
  if (claims[0].waited || !claims[1].waited) {
    throw new Error('expected the second claim to wait for the first');
  }
  if (!deployed) {
    // Local Explorer keeps Workers Traces in SQL: the lock's subrequest to
    // the `Locks` object is a child of tRPC's `trpc.claim` span.
    const parents = await waitForRows(
      base,
      `select parent.name from spans child join spans parent
         on parent.span_id = child.parent_id and parent.trace_id = child.trace_id
       where child.name = 'durable_object_subrequest' and parent.name like 'trpc.%'`,
    );
    console.log('traces: lock subrequest under', parents);
    if (!parents.includes('trpc.claim')) {
      throw new Error('expected the lock subrequest under trpc.claim');
    }
  }

  const seen: string[] = [];
  const done = (async () => {
    for await (const event of client.onMessage.subscribe()) {
      seen.push(`${event.data.from}: ${event.data.text}`);
      if (seen.length === 2) return;
    }
  })();
  // The subscription is registered once its first message reaches the object.
  await new Promise((resolve) => setTimeout(resolve, 200));
  await client.send.mutate({ from: 'ada', text: 'hello' });
  await client.send.mutate({ from: 'ada', text: 'still here' });
  await done;
  console.log('onMessage:', seen);
  if (seen.length !== 2) throw new Error('expected two messages');
  await ws.close();

  // The first response's body drops after two lines, as a lost connection
  // would; the link asks again for the frames after those.
  const resumedFrom: Array<string | null> = [];
  const durable = createTrpcClient({
    router: routerType<AppRouter>(),
    links: [
      experimental_durableLink({ delayMs: () => 50 }),
      httpLink({
        url,
        fetch: async (input, init) => {
          const request = new Request(input, init);
          resumedFrom.push(request.headers.get('trpc-resume-from'));
          const res = await fetch(request);
          return resumedFrom.length === 1 ? cutAfter(res, 2) : res;
        },
      }),
    ],
  });
  const digest = await durable.digest.mutate({
    topics: ['effect', 'workers', 'durable objects'],
  });
  const summaries: string[] = [];
  for await (const summary of digest.summaries) {
    summaries.push(`${summary.topic}: ${await summary.words} words`);
  }
  console.log('digest:', summaries, 'resumed from:', resumedFrom);
  if (summaries.length !== 3 || resumedFrom[1] !== '2') {
    throw new Error('expected the digest to resume after two frames');
  }
} finally {
  await worker?.dispose();
}

/** Polls Local Explorer's trace store until `sql` returns rows. */
async function waitForRows(
  base: string | URL,
  sql: string,
): Promise<unknown[]> {
  const url = new URL(
    '/cdn-cgi/local/explorer/api/local/observability/query',
    base,
  );
  for (let i = 0; i < 30; i++) {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ sql }),
    });
    const body = (await res.json()) as { result: { rows: unknown[][] } };
    if (body.result.rows.length > 0)
      return body.result.rows.map((row) => row[0]);
    await new Promise((r) => setTimeout(r, 100));
  }
  return [];
}

/** `res` with its JSONL body cut, like a dropped connection, after `lines` lines. */
function cutAfter(res: Response, lines: number): Response {
  const reader = res.body!.getReader();
  const decoder = new TextDecoder();
  const encoder = new TextEncoder();
  let buffered = '';
  let sent = 0;
  const body = new ReadableStream<Uint8Array>({
    async pull(controller) {
      while (true) {
        const newline = buffered.indexOf('\n');
        if (newline !== -1) {
          if (sent === lines) {
            await reader.cancel();
            return controller.error(new TypeError('network connection lost'));
          }
          sent++;
          controller.enqueue(encoder.encode(buffered.slice(0, newline + 1)));
          buffered = buffered.slice(newline + 1);
          return;
        }
        const chunk = await reader.read();
        if (chunk.done) return controller.close();
        buffered += decoder.decode(chunk.value, { stream: true });
      }
    },
  });
  return new Response(body, { status: res.status, headers: res.headers });
}
