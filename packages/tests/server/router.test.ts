import './___packages';
import { initTRPC } from '@trpc/server/src/core';
import { z } from 'zod';

const t = initTRPC.create();

describe('router', () => {
  test('is a reserved word', async () => {
    expect(() => {
      return t.router({
        then: t.procedure.query(() => 'hello'),
      });
    }).toThrowErrorMatchingInlineSnapshot(
      `"Reserved words used in \`router({})\` call: then"`,
    );
  });

  // Regression https://github.com/trpc/trpc/pull/2562
  test('because it creates async fns that returns proxy objects', async () => {
    const appRouter = t.router({});
    const asyncFnThatReturnsCaller = async () => appRouter.createCaller({});

    await asyncFnThatReturnsCaller();
  });

  test('should not duplicate key', async () => {
    expect(() =>
      t.router({
        foo: t.router({
          '.bar': t.procedure.query(() => 'bar' as const),
        }),
        'foo.': t.router({
          bar: t.procedure.query(() => 'bar' as const),
        }),
      }),
    ).toThrow('Duplicate key: foo..bar');
  });

  test('nested sub-router should be accessible', async () => {
    const router = t.router({
      foo: {
        bar: t.procedure.query(() => 'Hello I am recursive'),
      },
    });

    const caller = router.createCaller({});
    const result = await caller.foo.bar();
    expect(result).toBe('Hello I am recursive');
  });

  test('multiple nested levels of subrouter should be accessible', async () => {
    const router = t.router({
      foo: {
        bar: {
          foo: {
            bar: {
              foo: {
                bar: t.procedure.query(() => 'Hello I am recursive'),
              },
            },
          },
        },
      },
    });

    const caller = router.createCaller({});
    const result = await caller.foo.bar.foo.bar.foo.bar();
    expect(result).toBe('Hello I am recursive');
  });

  test('multiple nested levels of subrouter with different constructors should be accessible', async () => {
    const router = t.router({
      foo: {
        bar: t.router({
          foo: {
            bar: {
              foo: t.router({
                bar: t.procedure.query(() => 'Hello I am recursive'),
              }),
            },
          },
        }),
      },
    });

    const caller = router.createCaller({});
    const result = await caller.foo.bar.foo.bar.foo.bar();
    expect(result).toBe('Hello I am recursive');
  });

  test('combined router object should be accessible', async () => {
    const bar = {
      foo: t.procedure.query(() => 'Hello I am recursive'),
    };

    const router = t.router({
      foo: {
        bar,
      },
    });

    const caller = router.createCaller({});

    const result = await caller.foo.bar.foo();
    expect(result).toBe('Hello I am recursive');
  });

  test('realistic nested router should be accessible', async () => {
    const posts = [
      {
        id: '1',
        title: 'Post 1',
      },
      {
        id: '2',
        title: 'Post 2',
      },
      {
        id: '3',
        title: 'Post 3',
      },
    ];

    const router = t.router({
      post: {
        find: {
          all: t.procedure.query(() => posts),
          byId: t.procedure
            .input(z.object({ id: z.string() }))
            .query(({ input }) => {
              const post = posts.find((post) => post.id === input.id);
              return post;
            }),
        },
        create: {
          one: t.procedure
            .input(z.object({ title: z.string() }))
            .mutation(({ input }) => {
              const newPost = {
                id: String(posts.length + 1),
                title: input.title,
              };

              posts.push(newPost);

              return newPost;
            }),
        },
      },
    });

    const caller = router.createCaller({});

    expect(await caller.post.find.all()).toEqual(posts);
    expect(await caller.post.find.byId({ id: '1' })).toEqual(posts[0]);
    expect(await caller.post.create.one({ title: 'Post 4' })).toEqual({
      id: '4',
      title: 'Post 4',
    });
  });
});
