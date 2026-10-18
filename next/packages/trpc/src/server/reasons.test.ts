import { Predicate } from 'effect';
import {
  createTrpcClient,
  httpLink,
  routerType,
  safe,
} from '@trpc12/trpc/client';
import {
  createFetchHandler,
  initTrpc,
  type OnErrorOpts,
} from '@trpc12/trpc/server';
import { expect, test } from 'vite-plus/test';
import { z } from 'zod';

const t = initTrpc();

const router = {
  echo: t.procedure.input(z.unknown()).mutation((opts) => opts.input),
};

const post = (path: string, body: string) =>
  new Request(`http://localhost/trpc/${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body,
  });

test("the handler names each failure it makes, and doesn't send the name", async () => {
  const errors: OnErrorOpts[] = [];
  const limits: number[] = [];
  const handler = createFetchHandler({
    router,
    maxBodySize: 16,
    onError: (opts) => {
      errors.push(opts);
      if (Predicate.isTagged(opts.error.reason, 'BodyTooLarge')) {
        limits.push(opts.error.reason.limit);
      }
    },
  });

  const responses = [
    await handler.fetch(post('echo', '{')),
    await handler.fetch(post('echo', JSON.stringify({ json: 'x'.repeat(64) }))),
    await handler.fetch(post('nope', '{}')),
  ];
  expect(responses.map((res) => res.status)).toEqual([400, 413, 404]);

  const reasons = errors.map((opts) => opts.error.reason);
  expect(reasons[0]).toSatisfy(Predicate.isTagged('InvalidJson'));
  expect(reasons[1]).toSatisfy(Predicate.isTagged('BodyTooLarge'));
  expect(limits).toEqual([16]);
  expect(reasons[2]).toSatisfy(Predicate.isTagged('ProcedureNotFound'));
  expect(reasons[2]).toMatchObject({ path: 'nope' });

  const body = (await responses[0]!.json()) as { json: { error: object } };
  expect(body.json.error).toEqual({
    code: 'PARSE_ERROR',
    message: 'Invalid JSON',
    defined: false,
  });
});

test('client links name their own failures; server errors arrive without one', async () => {
  const handler = createFetchHandler({ router });
  const clientWith = (fetch: typeof globalThis.fetch) =>
    createTrpcClient({
      router: routerType<typeof router & { nope: typeof router.echo }>(),
      links: [httpLink({ url: 'http://localhost/trpc', fetch })],
    });

  const [, offline] = await safe(
    clientWith(() => Promise.reject(new TypeError('fetch failed'))).echo.mutate(
      1,
    ),
  );
  expect(offline).toMatchObject({
    code: 'NETWORK_ERROR',
    message: 'fetch failed',
  });
  expect(offline?.reason).toSatisfy(Predicate.isTagged('FetchFailed'));

  const [, mismatch] = await safe(
    clientWith(
      async () =>
        new Response('{}', { headers: { 'trpc-serializer': 'superjson' } }),
    ).echo.mutate(1),
  );
  expect(mismatch).toMatchObject({ code: 'UNSUPPORTED_PROTOCOL' });
  expect(mismatch?.reason).toSatisfy(Predicate.isTagged('SerializerMismatch'));
  expect(mismatch?.reason).toMatchObject({
    server: 'superjson',
    client: 'json',
    transport: 'httpLink',
  });

  const [, missing] = await safe(
    clientWith((input, init) =>
      handler.fetch(new Request(input as string, init as RequestInit)),
    ).nope.mutate(1),
  );
  expect(missing).toMatchObject({
    code: 'NOT_FOUND',
    message: 'No procedure at path "nope"',
  });
  expect(missing?.reason).toBeUndefined();
});
