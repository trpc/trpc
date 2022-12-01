import { InfiniteData } from '@tanstack/react-query';
import { createProxySSGHelpers } from '@trpc/react-query/src/ssg/ssgProxy';
import { inferAsyncReturnType, initTRPC } from '@trpc/server/src';
import { expectTypeOf } from 'expect-type';
import { CreateNextContextOptions } from 'packages/server/src/adapters/next';
import { z } from 'zod';

async function createContextInner() {
  return {
    inner: 'inner value',
  };
}

async function createContext(opts: CreateNextContextOptions) {
  const contextInner = await createContextInner();

  return {
    ...contextInner,
    outer: 'outer value',
    req: opts.req,
    res: opts.res,
  };
}

export type Context = inferAsyncReturnType<typeof createContext>;

const t = initTRPC.context<Context>().create();

const appRouter = t.router({
  post: t.router({
    byId: t.procedure
      .input(
        z.object({
          id: z.string(),
        }),
      )
      .query(() => '__result' as const),
    list: t.procedure
      .input(
        z.object({
          cursor: z.string().optional(),
        }),
      )
      .query(() => '__infResult' as const),
  }),
});

test('fetch', async () => {
  const ssg = createProxySSGHelpers({ router: appRouter, ctx: {} });

  const post = await ssg.post.byId.fetch({ id: '1' });
  expectTypeOf<'__result'>(post);
});

test('fetchInfinite', async () => {
  const ssg = createProxySSGHelpers({ router: appRouter, ctx: {} });

  const post = await ssg.post.list.fetchInfinite({});
  expectTypeOf<InfiniteData<'__infResult'>>(post);

  expect(post.pages).toStrictEqual(['__infResult']);
});

test('prefetch and dehydrate', async () => {
  const ssg = createProxySSGHelpers({ router: appRouter, ctx: {} });
  await ssg.post.byId.prefetch({ id: '1' });

  const data = JSON.stringify(ssg.dehydrate());
  expect(data).toContain('__result');
});

test('prefetchInfinite and dehydrate', async () => {
  const ssg = createProxySSGHelpers({ router: appRouter, ctx: {} });
  await ssg.post.list.prefetchInfinite({});

  const data = JSON.stringify(ssg.dehydrate());
  expect(data).toContain('__infResult');
});

describe('Creating SSG helpers infers the given context type', () => {
  test('happy path', async () => {
    createProxySSGHelpers({
      router: appRouter,
      ctx: await createContextInner(),
    });
  });

  test("given context is not a subset of router's context", async () => {
    createProxySSGHelpers({
      router: appRouter,
      // @ts-expect-error The given context is wrong on purpose.
      ctx: {
        wrong: 'on purpose',
      },
    });
  });
});
