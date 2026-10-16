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
        const { done, value } = await reader.read();
        if (done) return controller.close();
        buffered += decoder.decode(value, { stream: true });
      }
    },
  });
  return new Response(body, { status: res.status, headers: res.headers });
}
