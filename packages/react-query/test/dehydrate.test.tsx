import { createAppRouter } from './__testHelpers';
import { createServerSideHelpers } from '@trpc/react-query/server';
import { initTRPC } from '@trpc/server';

let factory: ReturnType<typeof createAppRouter>;
beforeEach(() => {
  factory = createAppRouter();
});
afterEach(async () => {
  await factory.close();
});

test('dehydrate', async () => {
  const { db, appRouter } = factory;
  const ssg = createServerSideHelpers({ router: appRouter, ctx: {} });

  await ssg.allPosts.prefetch();
  await ssg.postById.prefetch('1');

  const dehydrated = ssg.dehydrate().queries;
  expect(dehydrated).toHaveLength(2);

  const [cache, cache2] = dehydrated;
  expect(cache!.queryHash).toMatchInlineSnapshot(
    `"[["allPosts"],{"type":"query"}]"`,
  );
  expect(cache!.queryKey).toMatchInlineSnapshot(`
    Array [
      Array [
        "allPosts",
      ],
      Object {
        "type": "query",
      },
    ]
  `);
  expect(cache!.state.data).toEqual(db.posts);
  expect(cache2!.state.data).toMatchInlineSnapshot(`
    Object {
      "createdAt": 0,
      "id": "1",
      "title": "first post",
    }
  `);
});

// https://github.com/trpc/trpc/issues/6558
test('reuse the same instance of ssg', async () => {
  // using timers = fakeTimersResource();
  const t = initTRPC.create({});
  const router = t.router({
    hello1: t.procedure.query(async () => {
      await new Promise((resolve) => setTimeout(resolve, 1));
      return '1';
    }),
    hello2: t.procedure.query(async () => {
      await new Promise((resolve) => setTimeout(resolve, 2));
      return '2';
    }),
  });

  const ssg = createServerSideHelpers({ router, ctx: {} });

  const page1GetStaticProps = async () => {
    await ssg.hello1.fetch();

    return {
      props: {
        trpcState: ssg.dehydrate(),
      },
    };
  };

  // Reusing the same ssg instance
  const page2GetStaticProps = async () => {
    await Promise.all([ssg.hello1.fetch(), ssg.hello2.fetch()]);

    return {
      props: {
        trpcState: ssg.dehydrate(),
      },
    };
  };

  const page1 = page1GetStaticProps();
  const page2 = page2GetStaticProps();

  const page1Data = await page1;

  expect(
    page1Data.props.trpcState.queries.filter((it) => it.promise).length,
  ).toBe(0);

  const page2Data = await page2;
  expect(
    page2Data.props.trpcState.queries.filter((it) => it.promise).length,
  ).toBe(0);
});
