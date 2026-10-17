import { openAsBlob } from 'node:fs';
import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  createTrpcClient,
  httpLink,
  localLink,
  safe,
  wsLink,
  routerType,
} from '@trpc12/trpc/client';
import { createFetchHandler, initTrpc } from '@trpc12/trpc/server';
import { createSerializer, type Frame } from '@trpc12/trpc/serializer';
import { Effect, Stream } from 'effect';
import { createTestServer } from '../fixtures/server.ts';
import { expect, expectTypeOf, test } from 'vite-plus/test';
import { z } from 'zod';

/** Files at any depth are danSON's; plain JSON only sends a root file. */
const danson = createSerializer();

const t = initTrpc();

const router = {
  setCover: t.procedure
    .input(
      z.object({
        postId: z.string(),
        cover: z.instanceof(File),
        thumbs: z.array(z.instanceof(Blob)).optional(),
      }),
    )
    .mutation(async ({ input }) => ({
      postId: input.postId,
      name: input.cover.name,
      type: input.cover.type,
      text: await input.cover.text(),
      thumbs: await Promise.all(
        (input.thumbs ?? []).map(async (b) => [b.type, await b.text()]),
      ),
    })),
  size: t.procedure
    .input(z.object({ file: z.instanceof(File) }))
    .query((opts) => opts.input.file.size),
  hello: t.procedure.query(() => 'hello'),
  describe: t.procedure
    .input(z.object({ file: z.instanceof(File), blob: z.instanceof(Blob) }))
    .mutation(async ({ input }) => [
      input.file.name,
      input.file.type,
      input.blob.type,
      await input.blob.text(),
    ]),
  download: t.procedure.input(z.object({ name: z.string() })).query(
    (opts) =>
      new File(['report bytes'], opts.input.name, {
        type: 'text/csv',
        lastModified: 1_700_000_000_000,
      }),
  ),
  rawBlob: t.procedure.query(() => new Blob([new Uint8Array([0, 255, 1])])),
  gallery: t.procedure.query(async function* () {
    for (const name of ['1.png', '2.png', '3.png']) {
      yield new File([name], name, { type: 'image/png' });
    }
  }),
  photos: t.procedure.subscription(async function* () {
    for (const name of ['1.png', '2.png']) {
      yield { photo: new File([name], name, { type: 'image/png' }) };
    }
  }),
  attachments: t.procedure.query(() => {
    const big = new File([new Uint8Array(200_000).fill(7)], 'big.bin');
    return {
      title: 'Post',
      cover,
      files: [big, big],
      icon: new Blob(['<svg/>'], { type: 'image/svg+xml' }),
      empty: new File([], 'empty.txt'),
      later: new Promise<File>((resolve) =>
        setTimeout(() => resolve(new File(['late'], 'late.txt')), 5),
      ),
    };
  }),
};
type AppRouter = typeof router;

const cover = new File(['<png>'], 'a.png', { type: 'image/png' });

test('files anywhere in an input are sent as multipart parts', async () => {
  await using server = await createTestServer({ router, serializer: danson });
  const client = createTrpcClient({
    router: routerType<AppRouter>(),
    links: [httpLink({ url: server.url, serializer: danson })],
  });
  const thumb = new Blob(['small'], { type: 'image/webp' });
  expect(
    await client.setCover.mutate({
      postId: '1',
      cover,
      thumbs: [thumb, thumb],
    }),
  ).toEqual({
    postId: '1',
    name: 'a.png',
    type: 'image/png',
    text: '<png>',
    thumbs: [
      ['image/webp', 'small'],
      ['image/webp', 'small'],
    ],
  });
  expect(await client.size.query({ file: cover })).toBe(5);
  expect(server.requests.map((r) => r.method)).toEqual(['POST', 'POST']);
  expect(server.requests[0]!.headers.get('content-type')).toMatch(
    /^multipart\/form-data; boundary=/,
  );
  expectTypeOf<
    Parameters<typeof client.setCover.mutate>[0]['cover']
  >().toEqualTypeOf<File>();
});

test('a call with a file leaves the batch and goes alone', async () => {
  await using server = await createTestServer({
    router,
    serializer: danson,
    batch: true,
  });
  const client = createTrpcClient({
    router: routerType<AppRouter>(),
    links: [httpLink({ url: server.url, serializer: danson, batch: true })],
  });
  const [size, a, b] = await Promise.all([
    client.size.query({ file: cover }),
    client.hello.query(),
    client.hello.query(),
  ]);
  expect([size, a, b]).toEqual([5, 'hello', 'hello']);
  expect(server.requests).toHaveLength(2);
});

test('localLink passes files through', async () => {
  const client = createTrpcClient({
    router: routerType<AppRouter>(),
    links: [
      localLink({ router, serializer: danson, createContext: () => ({}) }),
    ],
  });
  expect(await client.size.query({ file: cover })).toBe(5);
});

test('wsLink rejects files with a clear error', async () => {
  await using server = await createTestServer({ router, serializer: danson });
  await using ws = wsLink({ url: server.wsUrl, serializer: danson });
  const client = createTrpcClient({
    router: routerType<AppRouter>(),
    links: [ws],
  });
  const [, err] = await safe(client.size.query({ file: cover }));
  expect(err).toMatchObject({
    code: 'BAD_REQUEST',
    message: expect.stringMatching(/only be sent as an input over httpLink/),
  });
});

test('maxBodySize applies to multipart bodies', async () => {
  await using server = await createTestServer({
    router,
    serializer: danson,
    maxBodySize: 256,
  });
  const client = createTrpcClient({
    router: routerType<AppRouter>(),
    links: [httpLink({ url: server.url, serializer: danson })],
  });
  const big = new File(['x'.repeat(1024)], 'big.txt');
  const [, err] = await safe(client.size.query({ file: big }));
  expect(err).toMatchObject({ code: 'PAYLOAD_TOO_LARGE' });

  const form = new Response(
    (() => {
      const f = new FormData();
      f.append('input', '{"json":{"file":"x"}}');
      f.append('0', big);
      return f;
    })(),
  );
  const res = await fetch(`${server.url}/size`, {
    method: 'POST',
    headers: {
      'content-type': form.headers.get('content-type')!,
      'trpc-version': '12',
    },
    body: form.body,
    duplex: 'half',
  } as RequestInit);
  expect(res.status).toBe(413);
});

test('parts that are missing or not referenced correctly are a PARSE_ERROR', async () => {
  await using server = await createTestServer({ router, serializer: danson });
  const form = new FormData();
  form.append(
    'input',
    JSON.stringify({
      json: { file: { _: '$', type: 'File', value: { part: 3, name: 'x' } } },
    }),
  );
  const res = await fetch(`${server.url}/size`, {
    method: 'POST',
    headers: { 'trpc-version': '12' },
    body: form,
  });
  expect(res.status).toBe(400);
  expect(await res.json()).toMatchObject({
    json: { error: { code: 'PARSE_ERROR' } },
  });

  const post = (json: unknown) => {
    const body = new FormData();
    body.append('input', JSON.stringify({ json }));
    body.append('0', new Blob(['bytes'], { type: 'x/y' }));
    return fetch(`${server.url}/describe`, {
      method: 'POST',
      headers: { 'trpc-version': '12' },
      body,
    });
  };
  // Refs without a name or type: a nameless file, an untyped blob.
  const bare = await post({
    file: { _: '$', type: 'File', value: { part: 0 } },
    blob: { _: '$', type: 'Blob', value: { part: 0 } },
  });
  expect(await bare.json()).toEqual({ json: ['blob', '', '', 'bytes'] });
  for (const value of [null, { part: '0' }]) {
    const res = await post({ file: { _: '$', type: 'File', value } });
    expect(await res.json()).toMatchObject({
      json: {
        error: { code: 'PARSE_ERROR', message: 'Missing multipart part' },
      },
    });
  }
});

test('a multipart mutation needs the trpc-version header, which a cross-site form cannot send', async () => {
  let ran = 0;
  await using server = await createTestServer({
    router: {
      post: t.procedure
        .input(z.object({ title: z.string() }))
        .mutation((opts) => {
          ran++;
          return opts.input.title;
        }),
    },
  });
  const form = () => {
    const f = new FormData();
    f.append('input', JSON.stringify({ json: { title: 'pwned' } }));
    return f;
  };
  const forged = await fetch(`${server.url}/post`, {
    method: 'POST',
    body: form(),
  });
  expect(forged.status).toBe(415);
  expect(await forged.json()).toMatchObject({
    json: {
      error: {
        code: 'UNSUPPORTED_MEDIA_TYPE',
        message: 'multipart/form-data requests need the trpc-version header',
      },
    },
  });
  expect(ran).toBe(0);

  const sent = await fetch(`${server.url}/post`, {
    method: 'POST',
    headers: { 'trpc-version': '12' },
    body: form(),
  });
  expect(sent.status).toBe(200);
  expect(ran).toBe(1);
});

test('a JSON body cannot claim to hold files', async () => {
  await using server = await createTestServer({ router, serializer: danson });
  const res = await fetch(`${server.url}/size`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      json: { file: { _: '$', type: 'File', value: { part: 0 } } },
    }),
  });
  expect(res.status).toBe(400);
});

test('a root File output of an unbatched call is the response body, with any serializer', async () => {
  await using server = await createTestServer({ router, batch: true });
  const client = createTrpcClient({
    router: routerType<AppRouter>(),
    links: [httpLink({ url: server.url, batch: false })],
  });
  const file = await client.download.query({ name: 'Q3 rapport – é.csv' });
  expectTypeOf(file).toEqualTypeOf<File>();
  expect(file).toBeInstanceOf(File);
  expect(file.name).toBe('Q3 rapport – é.csv');
  expect(file.type).toBe('text/csv');
  expect(file.lastModified).toBe(1_700_000_000_000);
  expect(await file.text()).toBe('report bytes');

  const res = await fetch(
    `${server.url}/download?input=${encodeURIComponent('{"name":"a.csv"}')}`,
  );
  expect(res.headers.get('content-type')).toBe('text/csv');
  expect(res.headers.get('content-disposition')).toBe(
    `inline; filename="a.csv"; filename*=UTF-8''a.csv`,
  );
  expect(await res.text()).toBe('report bytes');

  const blob = await client.rawBlob.query();
  expect(blob).not.toBeInstanceOf(File);
  expect(blob.type).toBe('');
  expect([...new Uint8Array(await blob.arrayBuffer())]).toEqual([0, 255, 1]);

  const batching = createTrpcClient({
    router: routerType<AppRouter>(),
    links: [httpLink({ url: server.url, batch: true })],
  });
  const alone = await batching.rawBlob.query(undefined, { batch: false });
  expect(alone.size).toBe(3);
  void (() => {
    // @ts-expect-error -- plain JSON can't batch a file, so the call leaves the batch
    void batching.rawBlob.query();
  });
});

test('a file that changes on disk while it downloads fails the response body', async () => {
  const path = join(await mkdtemp(join(tmpdir(), 'trpc-')), 'report.csv');
  await writeFile(path, 'first version');
  const handler = createFetchHandler({
    router: {
      report: t.procedure.query(async () => {
        const blob = await openAsBlob(path);
        await writeFile(path, 'a longer second version');
        return blob;
      }),
    },
  });
  const res = await handler.fetch(new Request('http://localhost/trpc/report'));
  expect(res.status).toBe(200);
  await expect(res.text()).rejects.toThrow('The blob could not be read');
  await handler.dispose();
});

test('a root File output in a batch streams like a nested one', async () => {
  await using server = await createTestServer({
    router,
    serializer: danson,
    batch: true,
  });
  const client = createTrpcClient({
    router: routerType<AppRouter>(),
    links: [httpLink({ url: server.url, serializer: danson, batch: true })],
  });
  const [file, hello] = await Promise.all([
    client.download.query({ name: 'a.csv' }),
    client.hello.query(),
  ]);
  expect(hello).toBe('hello');
  expect(file.name).toBe('a.csv');
  expect(await file.text()).toBe('report bytes');
  expect(server.requests).toHaveLength(1);
});

for (const transport of [
  'httpLink',
  'httpLink binary',
  'httpLink binary batch',
  'wsLink',
  'wsLink binary',
  'localLink',
] as const) {
  test(`files anywhere in an output stream as chunks (${transport})`, async () => {
    await using server = await createTestServer({
      router,
      serializer: danson,
      batch: true,
    });
    await using ws = wsLink({
      url: server.wsUrl,
      serializer: danson,
      binary: transport === 'wsLink binary',
    });
    const client = createTrpcClient({
      router: routerType<AppRouter>(),
      links: [
        transport === 'httpLink'
          ? httpLink({ url: server.url, serializer: danson })
          : transport === 'httpLink binary'
            ? httpLink({ url: server.url, serializer: danson, binary: true })
            : transport === 'httpLink binary batch'
              ? httpLink({
                  url: server.url,
                  serializer: danson,
                  binary: true,
                  batch: true,
                })
              : transport.startsWith('wsLink')
                ? ws
                : localLink({
                    router,
                    serializer: danson,
                    createContext: () => ({}),
                  }),
      ],
    });
    const out = await client.attachments.query();
    expectTypeOf(out.cover).toEqualTypeOf<File>();
    expectTypeOf(out.icon).toEqualTypeOf<Blob>();
    expect(out.title).toBe('Post');
    expect(out.cover.name).toBe('a.png');
    expect(out.cover.type).toBe('image/png');
    expect(await out.cover.text()).toBe('<png>');
    expect(out.files[1]).toEqual(out.files[0]);
    expect(out.files[0]!.size).toBe(200_000);
    expect(
      new Uint8Array(await out.files[0]!.arrayBuffer()).every((b) => b === 7),
    ).toBe(true);
    expect(out.icon).not.toBeInstanceOf(File);
    expect(out.icon.type).toBe('image/svg+xml');
    expect(await out.icon.text()).toBe('<svg/>');
    expect(out.empty.size).toBe(0);
    const late = await out.later;
    expect(late.name).toBe('late.txt');
    expect(await late.text()).toBe('late');
  });
}

test('binary frames carry nested file bytes unencoded when the client accepts them', async () => {
  await using server = await createTestServer({
    router,
    serializer: danson,
    batch: true,
  });
  const get = async (accept?: string) => {
    const res = await fetch(`${server.url}/attachments`, {
      headers: accept === undefined ? {} : { accept },
    });
    return {
      type: res.headers.get('content-type'),
      vary: res.headers.get('vary'),
      size: (await res.arrayBuffer()).byteLength,
    };
  };
  const jsonl = await get();
  const frames = await get('application/vnd.trpc.frames, application/jsonl');
  expect(jsonl.type).toMatch(/^application\/jsonl/);
  expect(frames.type).toMatch(/^application\/vnd\.trpc\.frames/);
  expect(frames.vary).toBe('accept');
  // `big` is 200 KB and sent once; base64 makes it 267 KB.
  expect(jsonl.size).toBeGreaterThan(266_000);
  expect(frames.size).toBeLessThan(202_000);

  const client = createTrpcClient({
    router: routerType<AppRouter>(),
    links: [
      httpLink({
        url: server.url,
        serializer: danson,
        binary: true,
        batch: true,
      }),
    ],
  });
  const [out, hello] = await Promise.all([
    client.attachments.query(),
    client.hello.query(),
  ]);
  expect(hello).toBe('hello');
  expect(out.files[0]!.size).toBe(200_000);
  expect(server.requests.at(-1)!.headers.get('accept')).toBe(
    'application/vnd.trpc.frames, application/jsonl',
  );
});

test('wsLink({ binary: true }) gets file bytes as binary messages and the rest as text', async () => {
  await using server = await createTestServer({ router, serializer: danson });
  const received: unknown[] = [];
  class Recording extends WebSocket {
    constructor(url: string | URL) {
      super(url);
      this.addEventListener('message', (event) => received.push(event.data));
    }
  }
  await using ws = wsLink({
    url: server.wsUrl,
    serializer: danson,
    binary: true,
    WebSocket: Recording,
  });
  const client = createTrpcClient({
    router: routerType<AppRouter>(),
    links: [ws],
  });
  const out = await client.attachments.query();
  expect(out.files[0]!.size).toBe(200_000);
  const size = (data: unknown[]) =>
    data.reduce<number>(
      (n, d) =>
        n + (d instanceof ArrayBuffer ? d.byteLength : String(d).length),
      0,
    );
  const binary = received.filter((d) => d instanceof ArrayBuffer);
  const text = received.filter((d) => typeof d === 'string');
  expect(size(binary)).toBeGreaterThan(200_000);
  expect(size(binary)).toBeLessThan(202_000);
  expect(size(text)).toBeLessThan(2_000);
  expect(text.some((d) => d.includes('"type":"result"'))).toBe(true);
});

for (const transport of ['httpLink', 'wsLink', 'wsLink binary'] as const) {
  test(`files inside subscription events decode while their bytes stream (${transport})`, async () => {
    await using server = await createTestServer({ router, serializer: danson });
    await using ws = wsLink({
      url: server.wsUrl,
      serializer: danson,
      binary: transport === 'wsLink binary',
    });
    const client = createTrpcClient({
      router: routerType<AppRouter>(),
      links: [
        transport === 'httpLink'
          ? httpLink({ url: server.url, serializer: danson })
          : ws,
      ],
    });
    const seen: string[] = [];
    for await (const event of client.photos.subscribe()) {
      seen.push(`${event.photo.name}:${await event.photo.text()}`);
    }
    expect(seen).toEqual(['1.png:1.png', '2.png:2.png']);
  });
}

test('files yielded by an async iterable arrive in order', async () => {
  await using server = await createTestServer({ router, serializer: danson });
  const client = createTrpcClient({
    router: routerType<AppRouter>(),
    links: [httpLink({ url: server.url, serializer: danson })],
  });
  const names: string[] = [];
  for await (const file of await client.gallery.query()) {
    names.push(`${file.name}:${await file.text()}`);
  }
  expect(names).toEqual(['1.png:1.png', '2.png:2.png', '3.png:3.png']);
});

test("a stream that ends before a file's bytes fails instead of hanging", async () => {
  const serialized = danson.serializeDeferred({
    file: new File(['bytes'], 'a.txt'),
  });
  const frames: Frame[] = [serialized.head];
  await Effect.runPromise(
    Stream.runForEach(serialized.chunks!, (chunk) =>
      Effect.sync(() => frames.push(chunk)),
    ),
  );
  const read = (list: Frame[]) =>
    Effect.runPromise(
      danson.deserializeStream<{ file: File }, never>(
        Stream.fromIterable(list),
      ),
    );
  expect(await (await read(frames)).file.text()).toBe('bytes');
  await expect(read(frames.slice(0, -1))).rejects.toThrow(/Stream interrupted/);
});
