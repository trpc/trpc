import { Data, Effect, Schema } from 'effect';
import {
  createTrpcClient,
  httpLink,
  isDefinedError,
  safe,
  TrpcError,
  routerType,
} from '@trpc12/trpc/client';
import { generateOpenApi } from '@trpc12/trpc/openapi';
import { initTrpc } from '@trpc12/trpc/server';
import { createTestServer } from '../fixtures/server.ts';
import { expect, expectTypeOf, test } from 'vite-plus/test';
import { z } from 'zod';

class PostNotFound extends TrpcError.Tagged('POST_NOT_FOUND', {
  status: 404,
  data: Schema.Struct({ id: Schema.String }),
}) {}

class Gone extends TrpcError.Tagged('GONE') {}

class SqlError extends Data.TaggedError('SqlError')<{ query: string }> {}

const t = initTrpc();
const posts = new Map([['1', { id: '1', title: 'Hello' }]]);

const find = (id: string) =>
  Effect.gen(function* () {
    const post = posts.get(id);
    if (!post) return yield* new PostNotFound({ id });
    return post;
  });

const router = {
  byId: t.procedure
    .input(z.object({ id: z.string() }))
    .query((opts) => find(opts.input.id)),
  gone: t.procedure.query(() => Effect.fail(new Gone())),
  thrown: t.procedure.query((): string => {
    throw new PostNotFound({ id: 'x' }, { message: 'No such post' });
  }),
  badData: t.procedure.query(() =>
    Effect.fail(new PostNotFound({ id: 1 } as unknown as { id: string })),
  ),
  recovered: t.procedure
    .input(z.object({ id: z.string() }))
    .query((opts) =>
      find(opts.input.id).pipe(
        Effect.catchTag('POST_NOT_FOUND', (e) =>
          Effect.succeed({ id: e.data.id, title: 'placeholder' }),
        ),
      ),
    ),
  sql: t.procedure.query(() =>
    // @ts-expect-error -- errors that aren't public must be mapped first
    Effect.fail(new SqlError({ query: 'select 1' })),
  ),
  documented: t.procedure
    .errors({ POST_NOT_FOUND: PostNotFound })
    .input(z.object({ id: z.string() }))
    .query((opts) => find(opts.input.id)),
};
type AppRouter = typeof router;

async function setup() {
  const server = await createTestServer({ router });
  const client = createTrpcClient({
    router: routerType<AppRouter>(),
    links: [httpLink({ url: server.url })],
  });
  return {
    client,
    url: server.url,
    [Symbol.asyncDispose]: () => server.close(),
  };
}

test('a yielded tagged error reaches the client typed, with its status and data', async () => {
  await using ctx = await setup();
  const [, err] = await safe(ctx.client.byId.query({ id: 'nope' }));
  expect(err).toBeInstanceOf(TrpcError);
  expect(err).toMatchObject({
    code: 'POST_NOT_FOUND',
    _tag: 'POST_NOT_FOUND',
    defined: true,
    data: { id: 'nope' },
  });
  const res = await fetch(
    `${ctx.url}/byId?input=${encodeURIComponent('{"id":"nope"}')}`,
  );
  expect(res.status).toBe(404);
  if (isDefinedError(err) && err.code === 'POST_NOT_FOUND') {
    expectTypeOf(err.data).toEqualTypeOf<{ readonly id: string }>();
  }
});

test('a tagged error without data defaults to 400', async () => {
  await using ctx = await setup();
  const [, err] = await safe(ctx.client.gone.query());
  expect(err).toMatchObject({ code: 'GONE', defined: true });
  expect((await fetch(`${ctx.url}/gone`)).status).toBe(400);
  expect(new Gone()).toBeInstanceOf(TrpcError);
  expect(new Gone()._tag).toBe('GONE');
});

test('a thrown tagged error is typed too, and keeps its message', async () => {
  await using ctx = await setup();
  const [, err] = await safe(ctx.client.thrown.query());
  expect(err).toMatchObject({
    code: 'POST_NOT_FOUND',
    message: 'No such post',
    defined: true,
  });
});

test('invalid data is an unexpected error', async () => {
  await using ctx = await setup();
  const [, err] = await safe(ctx.client.badData.query());
  expect(err).toMatchObject({ code: 'INTERNAL_SERVER_ERROR', defined: false });
});

test('Effect.catchTag recovers from a tagged error', async () => {
  await using ctx = await setup();
  expect(await ctx.client.recovered.query({ id: 'nope' })).toEqual({
    id: 'nope',
    title: 'placeholder',
  });
});

test('.errors() takes a tagged class, which documents it in OpenAPI', () => {
  const doc = generateOpenApi(
    { documented: router.documented },
    { info: { title: 'x', version: '1' } },
  );
  const responses = JSON.stringify(doc.paths);
  expect(responses).toContain('"404"');
  expect(responses).toContain('POST_NOT_FOUND');
});
