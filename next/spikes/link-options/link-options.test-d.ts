import { describe, expectTypeOf, test } from 'vite-plus/test';
import {
  cacheLink,
  httpLink,
  loggerLink,
  retryLink,
  splitLink,
  type,
  type AppRouter,
  type CallOptions,
  type Post,
  type TrpcClient,
} from './core.ts';
import {
  createClientA,
  createClientB,
  createClientC,
  createClientE,
  createClientEChecked,
} from './variants.ts';

describe('D-A curried', () => {
  const client = createClientA<AppRouter>()({
    links: [cacheLink(), loggerLink(), httpLink({ url: '/trpc' })],
  });

  test('link options and context are typed', () => {
    expectTypeOf(
      client.post.byId.query({ id: '1' }),
    ).resolves.toEqualTypeOf<Post>();
    void client.post.byId.query(
      { id: '1' },
      { ignoreCache: true, context: { headers: { a: 'b' } } },
    );
    // @ts-expect-error retryLink is not installed
    void client.post.byId.query({ id: '1' }, { retries: 3 });
  });

  test('router-aware links get typed paths without extra generics', () => {
    createClientA<AppRouter>()({
      links: [
        splitLink({
          condition: (op) => {
            expectTypeOf(op.path).toEqualTypeOf<
              'post.byId' | 'post.create' | 'health'
            >();
            return op.path === 'health';
          },
          true: retryLink(),
          false: httpLink({ url: '/trpc' }),
        }),
      ],
    });
  });
});

describe('D-B second generic', () => {
  const links = [cacheLink(), httpLink({ url: '/trpc' })];

  test('works when `typeof links` is passed', () => {
    const client = createClientB<AppRouter, typeof links>({ links });
    void client.post.byId.query({ id: '1' }, { ignoreCache: true });
  });

  test('a non-tuple array still merges every element declaration', () => {
    expectTypeOf<CallOptions<typeof links>>().toHaveProperty('ignoreCache');
  });

  test('a declaration-less link in a non-tuple array does not erase the others', () => {
    const mixed = [cacheLink(), loggerLink(), httpLink({ url: '/trpc' })];
    const client = createClientB<AppRouter, typeof mixed>({ links: mixed });
    void client.post.byId.query(
      { id: '1' },
      { ignoreCache: true, context: { headers: {} } },
    );
  });

  test('forgetting the second generic drops options loudly', () => {
    const client = createClientB<AppRouter>({ links });
    // @ts-expect-error ignoreCache is unknown without `typeof links`
    void client.post.byId.query({ id: '1' }, { ignoreCache: true });
  });

  test('links defined outside the call cannot see the router', () => {
    const split = splitLink({
      condition: (op) => {
        expectTypeOf(op.path).toEqualTypeOf<string>();
        return true;
      },
      true: retryLink(),
      false: httpLink({ url: '/trpc' }),
    });
    void split;
  });
});

describe('D-C router: type<AppRouter>()', () => {
  const client = createClientC({
    router: type<AppRouter>(),
    links: [cacheLink(), httpLink({ url: '/trpc' })],
  });

  test('router and links are both inferred', () => {
    expectTypeOf(
      client.post.create.mutate({ title: 't' }),
    ).resolves.toEqualTypeOf<Post>();
    void client.post.byId.query({ id: '1' }, { ignoreCache: true });
    // @ts-expect-error retryLink is not installed
    void client.post.byId.query({ id: '1' }, { retries: 3 });
  });

  test('router-aware links inline in `links` get typed paths', () => {
    createClientC({
      router: type<AppRouter>(),
      links: [
        splitLink({
          condition: (op) => {
            expectTypeOf(op.path).toEqualTypeOf<
              'post.byId' | 'post.create' | 'health'
            >();
            return true;
          },
          true: retryLink(),
          false: httpLink({ url: '/trpc' }),
        }),
      ],
    });
  });

  test('a link declared for another router is rejected', () => {
    type OtherRouter = { other: AppRouter['health'] };
    const other = splitLink<OtherRouter>({
      condition: () => true,
      true: loggerLink(),
      false: loggerLink(),
    });
    createClientC({
      router: type<AppRouter>(),
      // @ts-expect-error link is typed against OtherRouter
      links: [other],
    });
  });
});

describe('D-E return annotation', () => {
  const links = [cacheLink(), httpLink({ url: '/trpc' })];

  test('works when annotated', () => {
    const client: TrpcClient<
      AppRouter,
      CallOptions<typeof links>
    > = createClientE({ links });
    void client.post.byId.query({ id: '1' }, { ignoreCache: true });
  });

  test('unannotated is `unknown`', () => {
    const client = createClientE({ links });
    expectTypeOf(client).toBeUnknown();
  });

  test('annotation is unchecked against the links passed in', () => {
    const client: TrpcClient<
      AppRouter,
      CallOptions<[ReturnType<typeof retryLink>]>
    > = createClientE({ links: [loggerLink()] });
    void client.post.byId.query({ id: '1' }, { retries: 3 }); // compiles, but no retryLink
  });

  test('a checked variant rejects annotations the links cannot back', () => {
    const ok: TrpcClient<
      AppRouter,
      CallOptions<typeof links>
    > = createClientEChecked({ links });
    void ok;
    const bad: TrpcClient<
      AppRouter,
      CallOptions<[ReturnType<typeof retryLink>]>
    > = createClientEChecked({
      // @ts-expect-error annotation claims retryLink options
      links: [loggerLink()],
    });
    void bad;
  });
});
