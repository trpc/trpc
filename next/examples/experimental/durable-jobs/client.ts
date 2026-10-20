/**
 * Durable calls and locks, from the client's side:
 *
 * - A payment whose response is lost is retried by `experimental_durableLink`
 *   with the same call id, and the customer is charged once.
 * - Two payments for one invoice, one on each server, run one at a time.
 * - A report whose stream is cut on one server resumes on the other.
 *
 * `main(url, other)` sends the second payment and the resumed report to
 * `other`; with one server, pass one URL and everything goes there.
 */
import assert from 'node:assert/strict';
import {
  createTrpcClient,
  experimental_durableLink,
  httpStreamLink,
  routerType,
} from '@trpc12/trpc/client';
import type { AppRouter } from './server.ts';

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const connect = (url: string, fetch: typeof globalThis.fetch) =>
  createTrpcClient({
    router: routerType<AppRouter>(),
    links: [experimental_durableLink(), httpStreamLink({ url, fetch })],
  });

/** `res` with its JSON Lines body cut after `lines` lines, like a dropped connection. */
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

export async function main(url: string, other = url) {
  // Kept results and locks live in Redis across runs, so each run has its own ids.
  const run = Date.now();
  const onA = connect(url, fetch);
  const onB = connect(other, fetch);

  // --- a lost response ------------------------------------------------------

  const sentIds: Array<string | null> = [];
  let dropNext = true;
  const flaky = connect(url, async (input, init) => {
    sentIds.push(new Headers(init?.headers).get('trpc-call-id'));
    const res = await fetch(input, init);
    if (dropNext) {
      // The server answered, but the answer never arrives.
      dropNext = false;
      await res.body?.cancel();
      throw new TypeError('fetch failed');
    }
    return res;
  });
  const lost = `inv-${run}-1`;
  const paid = await flaky.invoice.pay.mutate({ invoice: lost });
  console.log('lost response, retried:', paid, 'call ids', sentIds);
  assert.equal(paid.status, 'paid');
  assert.equal(sentIds.length, 2);
  assert.ok(sentIds[0]);
  assert.equal(sentIds[0], sentIds[1]);
  assert.equal(await onA.invoice.charges.query({ invoice: lost }), 1);

  // --- one invoice, two servers ---------------------------------------------

  const invoice = `inv-${run}-2`;
  const both = await Promise.all([
    onA.invoice.pay.mutate({ invoice }),
    sleep(20).then(() => onB.invoice.pay.mutate({ invoice })),
  ]);
  console.log('same invoice on A and B:', both);
  assert.deepEqual(both, [
    { status: 'paid', waited: false },
    { status: 'already paid', waited: true },
  ]);
  assert.equal(await onA.invoice.charges.query({ invoice }), 1);

  // --- a stream cut mid-way, resumed on the other server --------------------

  const runsBefore = await onA.report.runs.query();
  const resumedFrom: Array<string | null> = [];
  // A load balancer that loses A mid-response and sends the retry to B.
  const failover = connect(url, async (input, init) => {
    const request = new Request(input, init);
    resumedFrom.push(request.headers.get('trpc-resume-from'));
    if (resumedFrom.length === 1) return cutAfter(await fetch(request), 3);
    return fetch(new Request(request.url.replace(url, other), request));
  });
  const report = await failover.report.build.mutate({ name: `report-${run}` });
  const rows: Array<{ row: number; total: number }> = [];
  for await (const row of report.rows) rows.push(row);
  const summary = await report.summary;
  console.log('report rows', rows.map((r) => r.row).join(','), summary, {
    resumedFrom,
  });
  assert.deepEqual(
    rows.map((r) => r.row),
    [1, 2, 3, 4, 5],
  );
  assert.deepEqual(summary, { rows: 5 });
  assert.deepEqual(resumedFrom, [null, '3']);
  assert.equal(await onA.report.runs.query(), runsBefore + 1);
}

if (import.meta.main) {
  const [url = 'http://localhost:3000/trpc', other] = process.argv.slice(2);
  await main(url, other);
}
