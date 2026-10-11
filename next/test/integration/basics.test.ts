import { Schema } from 'effect';
import { createTRPCClient, httpLink, safe } from 'trpcdev/client';
import { error, initTRPC, type InputValidationErrorData } from 'trpcdev/server';
import { createTestServer } from './fixtures/server.ts';
import { expect, expectTypeOf, test } from 'vite-plus/test';
import { z } from 'zod';

interface User {
  id: string;
  name: string;
}
interface Context {
  user: User | null;
}

const t = initTRPC<{ ctx: Context }>();

const authed = t.procedure.use(({ ctx, next }) =>
  ctx.user
    ? next({ ctx: { user: ctx.user } })
    : error({ code: 'UNAUTHORIZED', message: 'Sign in first' }),
);

const posts = new Map<string, { id: string; title: string; author: string }>();

const router = {
  health: t.procedure.query(() => 'ok' as const),
  greet: t.procedure
    .input(z.object({ name: z.string() }))
    .query(({ input }) => `hello ${input.name}`),
  add: t.procedure
    .input(Schema.Struct({ a: Schema.Number, b: Schema.Number }))
    .query(({ input }) => input.a + input.b),
  me: authed.query(({ ctx }) => ctx.user),
  post: {
    create: authed
      .input(z.object({ title: z.string().min(1) }))
      .mutation(({ ctx, input }) => {
        const post = {
          id: String(posts.size + 1),
          title: input.title,
          author: ctx.user.name,
        };
        posts.set(post.id, post);
        return post;
      }),
    byId: t.procedure
      .input(z.object({ id: z.string() }))
      .query(({ input }) => posts.get(input.id) ?? null),
  },
};
type AppRouter = typeof router;

async function setup(user: User | null = { id: 'u1', name: 'Alex' }) {
  const server = await createTestServer({
    router,
    createContext: () => ({ user }),
  });
  const client = createTRPCClient<AppRouter>({
    links: [httpLink({ url: server.url })],
  });
  return { server, client, [Symbol.asyncDispose]: () => server.close() };
}

test('query without input', async () => {
  await using ctx = await setup();
  const result = await ctx.client.health.query();
  expect(result).toBe('ok');
  expectTypeOf(result).toEqualTypeOf<'ok'>();
});

test('query with a Standard Schema (zod) input, sent as legible GET params', async () => {
  await using ctx = await setup();
  expect(await ctx.client.greet.query({ name: 'world' })).toBe('hello world');
  const request = ctx.server.requests.at(-1)!;
  expect(request.method).toBe('GET');
  expect(new URL(request.url).search).toBe('?name=world');
});

test('query with an Effect Schema input', async () => {
  await using ctx = await setup();
  const sum = await ctx.client.add.query({ a: 1, b: 2 });
  expect(sum).toBe(3);
  expectTypeOf(sum).toEqualTypeOf<number>();
});

test('mutation goes through middleware that extends ctx', async () => {
  await using ctx = await setup();
  const post = await ctx.client.post.create.mutate({ title: 'Hello' });
  expect(post).toMatchObject({ title: 'Hello', author: 'Alex' });
  expect(ctx.server.requests.at(-1)!.method).toBe('POST');
  expect(await ctx.client.post.byId.query({ id: post.id })).toEqual(post);
});

test('input validation errors are typed BAD_REQUEST with issues', async () => {
  await using ctx = await setup();
  const [, err] = await safe(ctx.client.post.create.mutate({ title: '' }));
  expect(err).toMatchObject({
    code: 'BAD_REQUEST',
    status: 400,
    defined: true,
  });
  if (err?.defined && err.code === 'BAD_REQUEST') {
    expectTypeOf(err.data).toEqualTypeOf<InputValidationErrorData>();
    expect(err.data.issues[0]!.path).toEqual(['title']);
  }
});

test('middleware short-circuits with a returned error', async () => {
  await using ctx = await setup(null);
  const [data, err] = await safe(ctx.client.me.query());
  expect(data).toBeUndefined();
  expect(err).toMatchObject({
    code: 'UNAUTHORIZED',
    status: 401,
    message: 'Sign in first',
    defined: true,
  });
});

test('unknown paths are NOT_FOUND', async () => {
  await using ctx = await setup();
  const res = await fetch(`${ctx.server.url}/nope`);
  expect(res.status).toBe(404);
  expect(await res.json()).toMatchObject({
    json: { error: { code: 'NOT_FOUND', defined: false } },
  });
});
