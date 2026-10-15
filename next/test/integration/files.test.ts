import {
  createTrpcClient,
  httpLink,
  localLink,
  safe,
  wsLink,
} from 'trpcdev/client';
import { initTrpc } from 'trpcdev/server';
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
