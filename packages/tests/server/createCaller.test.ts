import { z } from 'zod';
import './___packages';
import { ignoreErrors } from './___testHelpers';
import { initTRPC } from '@trpc/server/src/core';

describe('with context', () => {
  const t = initTRPC.context<{ foo: 'foo' }>().create();

  const appRouter = t.router({
    hello: t.procedure
      .input(
        z.object({
          who: z.string(),
        }),
      )
      .query((opts) => `hello ${opts.input.who}` as const),
  });

  const createCaller = t.createCallerFactory(appRouter);

  test('happy path', async () => {
    const caller = createCaller({
      foo: 'foo',
    });

    expect(await caller.hello({ who: 'world' })).toEqual('hello world');
  });

  test('context mismatch', async () => {
    const anotherRouter = initTRPC
      .context<{ moo: 'moo' }>()
      .create()
      .router({
        hello: t.procedure
          .input(
            z.object({
              who: z.string(),
            }),
          )
          .query((opts) => `hello ${opts.input.who}` as const),
      });

    ignoreErrors(() => {
      // @ts-expect-error wrong context
      t.createCallerFactory(anotherRouter);
    });
  });
});
describe('with async context', () => {
  const createContext = async () => {
    return {
      userId: '1',
    };
  };
  const t = initTRPC.context<typeof createContext>().create();

  const appRouter = t.router({
    hello: t.procedure
      .input(
        z.object({
          who: z.string(),
        }),
      )
      .query((opts) => `hello ${opts.input.who} - ${opts.ctx.userId}` as const),
  });

  const createCaller = t.createCallerFactory(appRouter);

  test('ugly RSC caller requires nested awaits', async () => {
    const trpc = async () => createCaller(await createContext());

    const hello = await (await trpc()).hello({ who: 'world' });
    expect(hello).toEqual('hello world - 1');
    expectTypeOf<`hello ${string} - ${string}`>(hello);
  });

  test('nicer RSC caller by passing fn', async () => {
    const trpc = createCaller(createContext);

    const hello = await trpc.hello({ who: 'world' });
    expect(hello).toEqual('hello world - 1');
    expectTypeOf<`hello ${string} - ${string}`>(hello);
  });

  test('mismatching return type', async () => {
    const badCreateContext = async () => 'foo' as const;
    // @ts-expect-error - Type '() => Promise<"foo">' is not assignable to type '() => Promise<{ userId: string; }>'.
    createCaller(badCreateContext);
  });
});
test('docs', async () => {
  type Context = {
    foo: string;
  };

  const t = initTRPC.context<Context>().create();

  const publicProcedure = t.procedure;
  const { createCallerFactory, router } = t;

  interface Post {
    id: string;
    title: string;
  }
  const posts: Post[] = [
    {
      id: '1',
      title: 'Hello world',
    },
  ];
  const appRouter = router({
    post: router({
      add: publicProcedure
        .input(
          z.object({
            title: z.string().min(2),
          }),
        )
        .mutation((opts) => {
          const post: Post = {
            ...opts.input,
            id: `${Math.random()}`,
          };
          posts.push(post);
          return post;
        }),
      list: publicProcedure.query(() => posts),
    }),
  });

  // create a caller-function for your router
  const createCaller = createCallerFactory(appRouter);

  // create a caller for
  const caller = createCaller({
    // the input here is your `Context`
    foo: 'bar',
  });
  const addedPost = await caller.post.add({
    title: 'How to make server-side call in tRPC',
  });
  //     ^?

  const postList = await caller.post.list();
  //       ^?

  expect(postList).toHaveLength(2);
});
