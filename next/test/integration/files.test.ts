import {
  createTrpcClient,
  httpLink,
  localLink,
  safe,
  wsLink,
} from 'trpcdev/client';
import { initTrpc } from 'trpcdev/server';
import { defaultSerializer, type Frame } from 'trpcdev/serializer';
import { Effect, Stream } from 'effect';
import { createTestServer } from './fixtures/server.ts';
import { expect, expectTypeOf, test } from 'vite-plus/test';
import { z } from 'zod';

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
    .query(({ input }) => input.file.size),
  hello: t.procedure.query(() => 'hello'),
  download: t.procedure.input(z.object({ name: z.string() })).query(
    ({ input }) =>
      new File(['report bytes'], input.name, {
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
  await using server = await createTestServer({ router });
  const client = createTrpcClient<AppRouter>({
    links: [httpLink({ url: server.url })],
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
  await using server = await createTestServer({ router, batch: true });
  const client = createTrpcClient<AppRouter>({
    links: [httpLink({ url: server.url, batch: true })],
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
  const client = createTrpcClient<AppRouter>({
    links: [localLink({ router, createContext: () => ({}) })],
  });
  expect(await client.size.query({ file: cover })).toBe(5);
});

test('wsLink rejects files with a clear error', async () => {
  await using server = await createTestServer({ router });
  await using ws = wsLink({ url: server.wsUrl });
  const client = createTrpcClient<AppRouter>({ links: [ws] });
  const [, err] = await safe(client.size.query({ file: cover }));
  expect(err).toMatchObject({
    code: 'BAD_REQUEST',
    message: expect.stringMatching(/only be sent as an input over httpLink/),
  });
});

test('maxBodySize applies to multipart bodies', async () => {
  await using server = await createTestServer({ router, maxBodySize: 256 });
  const client = createTrpcClient<AppRouter>({
    links: [httpLink({ url: server.url })],
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
    headers: { 'content-type': form.headers.get('content-type')! },
    body: form.body,
    duplex: 'half',
  } as RequestInit);
  expect(res.status).toBe(413);
});

test('parts that are missing or not referenced correctly are a PARSE_ERROR', async () => {
  await using server = await createTestServer({ router });
  const form = new FormData();
  form.append(
    'input',
    JSON.stringify({
      json: { file: { _: '$', type: 'File', value: { part: 3, name: 'x' } } },
    }),
  );
  const res = await fetch(`${server.url}/size`, { method: 'POST', body: form });
  expect(res.status).toBe(400);
  expect(await res.json()).toMatchObject({
    json: { error: { code: 'PARSE_ERROR' } },
  });
});

test('a JSON body cannot claim to hold files', async () => {
  await using server = await createTestServer({ router });
  const res = await fetch(`${server.url}/size`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      json: { file: { _: '$', type: 'File', value: { part: 0 } } },
    }),
  });
  expect(res.status).toBe(400);
});

test('a root File output of an unbatched call is the response body', async () => {
  await using server = await createTestServer({ router, batch: true });
  const client = createTrpcClient<AppRouter>({
    links: [httpLink({ url: server.url, batch: false })],
  });
  const file = await client.download.query({ name: 'Q3 rapport – é.csv' });
  expectTypeOf(file).toEqualTypeOf<File>();
  expect(file).toBeInstanceOf(File);
  expect(file.name).toBe('Q3 rapport – é.csv');
  expect(file.type).toBe('text/csv');
  expect(file.lastModified).toBe(1_700_000_000_000);
  expect(await file.text()).toBe('report bytes');

  const res = await fetch(`${server.url}/download?name=a.csv`);
  expect(res.headers.get('content-type')).toBe('text/csv');
  expect(res.headers.get('content-disposition')).toBe(
    `inline; filename="a.csv"; filename*=UTF-8''a.csv`,
  );
  expect(await res.text()).toBe('report bytes');

  const blob = await client.rawBlob.query();
  expect(blob).not.toBeInstanceOf(File);
  expect(blob.type).toBe('');
  expect([...new Uint8Array(await blob.arrayBuffer())]).toEqual([0, 255, 1]);
});

test('a root File output in a batch streams like a nested one', async () => {
  await using server = await createTestServer({ router, batch: true });
  const client = createTrpcClient<AppRouter>({
    links: [httpLink({ url: server.url, batch: true })],
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
  'localLink',
] as const) {
  test(`files anywhere in an output stream as chunks (${transport})`, async () => {
    await using server = await createTestServer({ router, batch: true });
    await using ws = wsLink({ url: server.wsUrl });
    const client = createTrpcClient<AppRouter>({
      links: [
        transport === 'httpLink'
          ? httpLink({ url: server.url })
          : transport === 'httpLink binary'
            ? httpLink({ url: server.url, binary: true })
            : transport === 'httpLink binary batch'
              ? httpLink({ url: server.url, binary: true, batch: true })
              : transport === 'wsLink'
                ? ws
                : localLink({ router, createContext: () => ({}) }),
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
  await using server = await createTestServer({ router, batch: true });
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

  const client = createTrpcClient<AppRouter>({
    links: [httpLink({ url: server.url, binary: true, batch: true })],
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

for (const transport of ['httpLink', 'wsLink'] as const) {
  test(`files inside subscription events decode while their bytes stream (${transport})`, async () => {
    await using server = await createTestServer({ router });
    await using ws = wsLink({ url: server.wsUrl });
    const client = createTrpcClient<AppRouter>({
      links: [transport === 'wsLink' ? ws : httpLink({ url: server.url })],
    });
    const seen: string[] = [];
    for await (const event of client.photos.subscribe()) {
      seen.push(`${event.photo.name}:${await event.photo.text()}`);
    }
    expect(seen).toEqual(['1.png:1.png', '2.png:2.png']);
  });
}

test('files yielded by an async iterable arrive in order', async () => {
  await using server = await createTestServer({ router });
  const client = createTrpcClient<AppRouter>({
    links: [httpLink({ url: server.url })],
  });
  const names: string[] = [];
  for await (const file of await client.gallery.query()) {
    names.push(`${file.name}:${await file.text()}`);
  }
  expect(names).toEqual(['1.png:1.png', '2.png:2.png', '3.png:3.png']);
});

test("a stream that ends before a file's bytes fails instead of hanging", async () => {
  const { head, chunks } = defaultSerializer.serializeDeferred({
    file: new File(['bytes'], 'a.txt'),
  });
  const frames: Frame[] = [head];
  await Effect.runPromise(
    Stream.runForEach(chunks!, (chunk) =>
      Effect.sync(() => frames.push(chunk)),
    ),
  );
  const read = (list: Frame[]) =>
    Effect.runPromise(
      defaultSerializer.deserializeStream<{ file: File }, never>(
        Stream.fromIterable(list),
      ),
    );
  expect(await (await read(frames)).file.text()).toBe('bytes');
  await expect(read(frames.slice(0, -1))).rejects.toThrow(/Stream interrupted/);
});
