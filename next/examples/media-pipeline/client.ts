/**
 * Media pipeline: upload photos and get back reports whose fields resolve as
 * they're ready. Files in and out, streamed progress, nested promises,
 * binary frames, an Effect `Stream` subscription, and progressive JSON's custom types
 * next to superjson. `main(url)` throws on any wrong result.
 */
import assert from 'node:assert/strict';
import { Effect, Stream } from 'effect';
import {
  createTrpcClient,
  httpLink,
  matchError,
  routerType,
  safe,
  TrpcError,
} from '@trpc12/trpc/client';
import { createEffectClient } from '@trpc12/trpc/effect';
import { progressiveJson, Money, sync } from './money.ts';
import { MAX_ORIGINAL_BYTES, STEP_LATENCY } from './photos.ts';
import type { AppRouter } from './server.ts';

const DAY = 24 * 60 * 60 * 1000;

/** A PNG signature and IHDR chunk: all the pipeline reads. */
function png(name: string, width: number, height: number): File {
  const bytes = new Uint8Array(33);
  bytes.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const view = new DataView(bytes.buffer);
  view.setUint32(8, 13);
  bytes.set(new TextEncoder().encode('IHDR'), 12);
  view.setUint32(16, width);
  view.setUint32(20, height);
  bytes.set([8, 2, 0, 0, 0], 24);
  return new File([bytes], name, { type: 'image/png' });
}

const bytesOf = async (blob: Blob) => [
  ...new Uint8Array(await blob.arrayBuffer()),
];

/** Runs the pipeline against the progressive JSON endpoint at `url`; `/sync` is beside it. */
export async function main(url: string) {
  const syncUrl = new URL('sync', url).href;

  /** Every request the links send, to check what went over the wire. */
  const sent: { method: string; url: URL; multipart: boolean }[] = [];
  const recordingFetch: typeof fetch = (input, init) => {
    sent.push({
      method: init?.method ?? 'GET',
      url: new URL(input instanceof Request ? input.url : input),
      multipart: init?.body instanceof FormData,
    });
    return fetch(input, init);
  };
  const sentTo = (path: string) => sent.filter((r) => r.url.pathname === path);

  const router = routerType<AppRouter>();
  const client = createTrpcClient({
    router,
    links: [
      httpLink({
        url,
        batch: true,
        transformer: progressiveJson,
        fetch: recordingFetch,
      }),
    ],
  });
  const binary = createTrpcClient({
    router,
    links: [httpLink({ url, transformer: progressiveJson, binary: true })],
  });
  const superjsonClient = createTrpcClient({
    router,
    links: [
      httpLink({ url: syncUrl, transformer: sync, fetch: recordingFetch }),
    ],
  });
  const effectClient = createEffectClient({
    router,
    links: [httpLink({ url, transformer: progressiveJson })],
  });

  // --- events: an Effect Stream, followed with the Effect client ------------------------

  const listening = Promise.withResolvers<void>();
  const events = Effect.runPromise(
    effectClient.photos.events.subscribe().pipe(
      Stream.tap((event) =>
        Effect.sync(() => {
          if (event.kind === 'listening') listening.resolve();
        }),
      ),
      // `listening`, then 3 `uploaded` and 3 `processed`
      Stream.take(7),
      Stream.runCollect,
    ),
  );
  await listening.promise;

  // --- upload: multipart in, streamed progress out ---------------------------------------

  const originals = [
    png('beach.png', 4000, 3000),
    png('portrait.png', 3000, 4000),
    png('square.png', 2048, 2048),
  ];
  const progress: string[] = [];
  const ids: string[] = [];
  for await (const item of await client.photos.upload.mutate({
    album: 'summer',
    photos: originals,
  })) {
    progress.push(`${item.done}/${item.total} ${item.name}`);
    ids.push(item.id);
  }
  console.log('photos.upload:', progress);
  assert.deepEqual(progress, [
    '1/3 beach.png',
    '2/3 portrait.png',
    '3/3 square.png',
  ]);
  assert.deepEqual(
    sentTo('/trpc/photos.upload').map((r) => [r.method, r.multipart]),
    [['POST', true]],
  );
  const [beach, portrait, square] = ids as [string, string, string];

  // --- report: the head first, then each nested promise as it settles --------------------

  let contentType: string | null = null;
  const started = performance.now();
  const report = await client.photos.report.query(
    { id: beach },
    {
      onResponse: (res) => void (contentType = res.headers.get('content-type')),
    },
  );
  const headAt = performance.now() - started;
  const metadata = await report.metadata;
  const metadataAt = performance.now() - started;
  const placeholder = await report.placeholder;
  const placeholderAt = performance.now() - started;
  console.log('photos.report:', {
    head: `${report.name}, ${report.bytes} bytes at ${Math.round(headAt)}ms`,
    metadata: `${metadata.width}x${metadata.height} at ${Math.round(metadataAt)}ms`,
    placeholder: `${placeholder.name} at ${Math.round(placeholderAt)}ms`,
  });
  assert.equal(contentType, 'application/jsonl');
  assert.ok(report.uploadedAt instanceof Date);
  assert.equal(report.bytes, originals[0]!.size);
  assert.deepEqual([metadata.width, metadata.height], [4000, 3000]);
  assert.match(metadata.sha256, /^[0-9a-f]{64}$/);
  // Nothing waits for the slowest part: each arrives when the server has it.
  assert.ok(
    metadataAt - headAt >= STEP_LATENCY / 2,
    'metadata came with the head',
  );
  assert.ok(
    placeholderAt - metadataAt >= STEP_LATENCY,
    'placeholder came with the metadata',
  );
  assert.ok(placeholder instanceof File);
  assert.equal(placeholder.type, 'image/svg+xml');
  assert.match(await placeholder.text(), /width="32" height="24"/);

  // Two reports in one tick share a batch request, and still stream.
  const requestsBefore = sent.length;
  const reports = await Promise.all([
    client.photos.report.query({ id: portrait }),
    client.photos.report.query({ id: square }),
  ]);
  assert.equal(sent.length, requestsBefore + 1);
  const placeholders = await Promise.all(reports.map((r) => r.placeholder));
  assert.match(await placeholders[0]!.text(), /width="32" height="43"/);
  assert.match(await placeholders[1]!.text(), /width="32" height="32"/);

  const seen = await events;
  console.log('photos.events:', seen.map((e) => e.kind).join(', '));
  assert.deepEqual(
    seen.map((e) => e.kind),
    [
      'listening',
      'uploaded',
      'uploaded',
      'uploaded',
      'processed',
      'processed',
      'processed',
    ],
  );

  // --- binary frames: the same report, file bytes unencoded --------------------------------

  let framesType: string | null = null;
  const framed = await binary.photos.report.query(
    { id: beach },
    {
      onResponse: (res) => void (framesType = res.headers.get('content-type')),
    },
  );
  assert.equal(framesType, 'application/vnd.trpc.frames');
  assert.equal(
    await (await framed.placeholder).text(),
    await placeholder.text(),
  );

  // --- files out: the original as the response body, and an export streaming files -------

  let originalType: string | null = null;
  const original = await client.photos.original.query(
    { id: beach },
    {
      batch: false,
      onResponse: (res) =>
        void (originalType = res.headers.get('content-type')),
    },
  );
  assert.equal(originalType, 'image/png');
  assert.ok(original instanceof File);
  assert.equal(original.name, 'beach.png');
  assert.deepEqual(await bytesOf(original), await bytesOf(originals[0]!));

  // The same URL is a download link.
  const download = await fetch(
    `${url}/photos.original?input=${encodeURIComponent(JSON.stringify({ id: square }))}`,
  );
  assert.equal(download.headers.get('content-type'), 'image/png');
  assert.match(
    download.headers.get('content-disposition') ?? '',
    /filename="square\.png"/,
  );
  assert.deepEqual(
    await bytesOf(await download.blob()),
    await bytesOf(originals[2]!),
  );

  const exported: string[] = [];
  const iterator = (await binary.album.export.query({ album: 'summer' }))[
    Symbol.asyncIterator
  ]();
  let next = await iterator.next();
  while (!next.done) {
    assert.ok(next.value.file instanceof File);
    exported.push(`${next.value.id}: ${next.value.file.name}`);
    next = await iterator.next();
  }
  console.log('album.export:', exported, next.value);
  assert.deepEqual(exported, [
    `${beach}: beach.png`,
    `${portrait}: portrait.png`,
    `${square}: square.png`,
  ]);
  assert.deepEqual(next.value, {
    count: 3,
    bytes: originals.reduce((sum, f) => sum + f.size, 0),
  });

  // --- errors: a missing photo, and a failure inside a nested promise -----------------------

  const [, missing] = await safe(client.photos.report.query({ id: 'nope' }));
  assert.ok(missing);
  const reason = matchError(missing, {
    PHOTO_NOT_FOUND: (e) => `no photo ${e.data.id}`,
    BAD_REQUEST: (e) => `invalid input: ${e.data.issues.length} issues`,
    NETWORK_ERROR: () => 'offline',
    BAD_RESPONSE: (e) => `unreadable: ${e.message}`,
    unexpected: (e) => `${e.code}: ${e.message}`,
  });
  console.log('photos.report failed:', reason);
  assert.equal(reason, 'no photo nope');

  for await (const item of await client.photos.upload.mutate({
    album: 'junk',
    photos: [new File(['hello'], 'notes.txt', { type: 'text/plain' })],
  })) {
    const junk = await client.photos.report.query({ id: item.id });
    assert.equal(junk.name, 'notes.txt');
    const isNotAPng = (err: unknown) =>
      err instanceof TrpcError && err.code === 'NOT_A_PNG';
    await assert.rejects(junk.metadata, isNotAPng);
    await assert.rejects(junk.placeholder, isNotAPng);
  }

  // --- abort: the client leaves, and the server stops the upload ---------------------------

  const controller = new AbortController();
  const big = Array.from({ length: 6 }, (_, i) => png(`big-${i}.png`, 64, 64));
  let uploadId: string | undefined;
  await assert.rejects(async () => {
    for await (const item of await client.photos.upload.mutate(
      { album: 'big', photos: big },
      { signal: controller.signal },
    )) {
      uploadId = item.uploadId;
      controller.abort();
    }
  });
  assert.ok(uploadId);
  let upload = await client.photos.uploadStatus.query({ uploadId });
  for (let i = 0; upload.status === 'running' && i < 50; i++) {
    await new Promise((resolve) => setTimeout(resolve, 20));
    upload = await client.photos.uploadStatus.query({ uploadId });
  }
  console.log('aborted upload:', upload);
  assert.equal(upload.status, 'stopped');
  assert.ok(upload.stored < upload.total);

  // --- byte stream in: the request body is the input (experimental) ------------------------

  const panorama = new File(
    [
      await png('panorama.png', 12000, 3000).arrayBuffer(),
      new Uint8Array(300_000),
    ],
    'panorama.png',
    { type: 'image/png' },
  );
  const received: number[] = [];
  let storedId: string | undefined;
  for await (const item of await client.photos.uploadOriginal.mutate(
    panorama.stream(),
  )) {
    if (item.kind === 'received') received.push(item.bytes);
    else {
      storedId = item.id;
      assert.equal(item.bytes, panorama.size);
    }
  }
  console.log(
    'photos.uploadOriginal:',
    `${received.length} chunks, ${received.at(-1)} bytes, stored as ${storedId}`,
  );
  assert.ok(storedId);
  // Progress for each chunk the server read, while the body was still coming.
  assert.ok(received.length > 1, 'the body arrived as one chunk');
  assert.ok(received.every((bytes, i) => i === 0 || bytes > received[i - 1]!));
  assert.equal(received.at(-1), panorama.size);
  // Never batched: the stream is the whole POST body.
  assert.deepEqual(
    sentTo('/trpc/photos.uploadOriginal').map((r) => r.method),
    ['POST'],
  );
  const storedReport = await client.photos.report.query({ id: storedId });
  const storedMetadata = await storedReport.metadata;
  assert.deepEqual(
    [storedMetadata.width, storedMetadata.height],
    [12000, 3000],
  );
  assert.equal(storedReport.bytes, panorama.size);

  // Past `maxBytes` the input stream fails, and so does the call.
  await assert.rejects(
    async () => {
      const huge = new Blob([new Uint8Array(MAX_ORIGINAL_BYTES + 1)]);
      const items = await client.photos.uploadOriginal.mutate(huge.stream());
      for await (const item of items) assert.equal(item.kind, 'received');
    },
    (err) => err instanceof TrpcError && err.code === 'PAYLOAD_TOO_LARGE',
  );

  // --- query URLs and transformers: rich input over GET, progressive JSON and superjson ---------------

  const quoteInput = {
    lines: [
      { photoId: beach, size: 'L', copies: 2 },
      { photoId: square, size: 'S', copies: 1 },
    ],
    finishes: new Set(['gloss'] as const),
    deliverBy: new Date(Date.now() + 2 * DAY),
    budget: new Money(5000, 'EUR'),
  } as const;

  const quote = await client.prints.quote.query(quoteInput);
  console.log('prints.quote:', quote.total.toString(), quote.fitsBudget);
  assert.ok(quote.total instanceof Money);
  assert.equal(quote.total.toString(), '38.50 EUR');
  assert.equal(quote.rush.toString(), '15.00 EUR');
  assert.ok(quote.lines instanceof Map);
  assert.equal(quote.lines.get(beach)?.toString(), '18.00 EUR');
  assert.ok(quote.deliverBy instanceof Date);
  assert.equal(quote.deliverBy.getTime(), quoteInput.deliverBy.getTime());
  assert.equal(quote.fitsBudget, true);

  // Unbatched, a query is a GET with the input in the URL, keys sorted: equal
  // inputs make one URL, whatever order the keys were written in.
  await client.prints.quote.query(quoteInput, { batch: false });
  await client.prints.quote.query(
    {
      budget: quoteInput.budget,
      deliverBy: quoteInput.deliverBy,
      finishes: quoteInput.finishes,
      lines: quoteInput.lines,
    },
    { batch: false },
  );
  const [first, second] = sentTo('/trpc/prints.quote');
  assert.ok(first && second);
  assert.equal(first.method, 'GET');
  assert.equal(first.url.search, second.url.search);
  assert.match(first.url.searchParams.get('input') ?? '', /"type":"Money"/);

  // superjson keeps Money too, through `registerCustom`.
  const viaSuperjson = await superjsonClient.prints.quote.query(quoteInput);
  assert.ok(viaSuperjson.total instanceof Money);
  assert.equal(viaSuperjson.total.toString(), '38.50 EUR');
  assert.ok(viaSuperjson.lines instanceof Map);
  assert.ok(viaSuperjson.deliverBy instanceof Date);
  assert.equal(sentTo('/sync/prints.quote')[0]?.method, 'GET');

  // A root File is the response body with any transformer…
  const viaSuperjsonFile = await superjsonClient.photos.original.query({
    id: portrait,
  });
  assert.equal(viaSuperjsonFile.name, 'portrait.png');

  // …but files in inputs need progressive JSON: the call fails before anything is sent.
  const syncRequests = sentTo('/sync/photos.upload').length;
  await assert.rejects(
    superjsonClient.photos.upload.mutate({
      album: 'x',
      photos: [originals[0]!],
    }),
  );
  assert.equal(sentTo('/sync/photos.upload').length, syncRequests);

  console.log('media-pipeline: ok');
}

if (import.meta.main) {
  await main(process.argv[2] ?? 'http://localhost:3000/trpc');
}
