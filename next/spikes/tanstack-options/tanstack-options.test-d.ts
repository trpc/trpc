import {
  QueryClient,
  skipToken,
  type InfiniteData,
} from '@tanstack/query-core';
import { describe, expectTypeOf, test } from 'vite-plus/test';
import {
  useInfiniteQuery,
  useQuery,
  type PositionalQueryProcedureUtils,
  type QueryProcedureUtils,
  type StreamProcedureUtils,
} from './core.ts';

interface Post {
  id: string;
  title: string;
}
interface Page {
  items: Post[];
  nextCursor: string | undefined;
}
interface ClientError {
  code: string;
}

declare const trpc: {
  post: {
    byId: QueryProcedureUtils<{ id: string }, Post, ClientError>;
    list: QueryProcedureUtils<
      { limit: number; cursor?: string | undefined },
      Page,
      ClientError
    >;
    count: QueryProcedureUtils<undefined, number, ClientError>;
  };
  chat: {
    stream: StreamProcedureUtils<
      { chatId: string },
      { text: string },
      ClientError
    >;
  };
};
declare const v11: {
  post: {
    byId: PositionalQueryProcedureUtils<{ id: string }, Post, ClientError>;
    list: PositionalQueryProcedureUtils<
      { limit: number; cursor?: string | undefined },
      Page,
      ClientError
    >;
  };
};
declare const id: string | undefined;
declare const queryClient: QueryClient;

describe('19: option bag', () => {
  test('input and TanStack options share one object; data and error are typed', () => {
    const q = useQuery(
      trpc.post.byId.queryOptions({ input: { id: '1' }, staleTime: 1000 }),
    );
    expectTypeOf(q.data).toEqualTypeOf<Post | undefined>();
    expectTypeOf(q.error).toEqualTypeOf<ClientError | null>();
  });

  test('select infers TData inside the bag and its argument is contextually typed', () => {
    const q = useQuery(
      trpc.post.byId.queryOptions({
        input: { id: '1' },
        select: (post) => {
          expectTypeOf(post).toEqualTypeOf<Post>();
          return post.title.length;
        },
      }),
    );
    expectTypeOf(q.data).toEqualTypeOf<number | undefined>();
  });

  test('skipToken and no-input procedures', () => {
    useQuery(trpc.post.byId.queryOptions({ input: id ? { id } : skipToken }));
    useQuery(trpc.post.count.queryOptions());
    useQuery(trpc.post.count.queryOptions({ staleTime: 1 }));
    // @ts-expect-error input is required
    trpc.post.byId.queryOptions({ staleTime: 1 });
    // @ts-expect-error wrong input
    trpc.post.byId.queryOptions({ input: { id: 1 } });
    // @ts-expect-error unknown option is caught (excess property check survives the intersection)
    trpc.post.byId.queryOptions({ input: { id: '1' }, staleTme: 1 });
  });

  test('queryKey is a DataTag, so the QueryClient is typed', () => {
    const data = queryClient.getQueryData(
      trpc.post.byId.queryKey({ input: { id: '1' } }),
    );
    expectTypeOf(data).toEqualTypeOf<Post | undefined>();
    queryClient.setQueryData(
      trpc.post.byId.queryKey({ input: { id: '1' } }),
      (old) => {
        expectTypeOf(old).toEqualTypeOf<Post | undefined>();
        return old;
      },
    );
    const fromOptions = queryClient.getQueryData(
      trpc.post.byId.queryOptions({ input: { id: '1' } }).queryKey,
    );
    expectTypeOf(fromOptions).toEqualTypeOf<Post | undefined>();
  });

  test('positional (v11) form types identically', () => {
    const bag = useQuery(
      trpc.post.byId.queryOptions({ input: { id: '1' }, select: (p) => p.id }),
    );
    const positional = useQuery(
      v11.post.byId.queryOptions({ id: '1' }, { select: (p) => p.id }),
    );
    expectTypeOf(bag.data).toEqualTypeOf(positional.data);
  });
});

describe('19: infinite queries', () => {
  test('explicit input(pageParam): TPageParam is inferred from initialPageParam + getNextPageParam', () => {
    const q = useInfiniteQuery(
      trpc.post.list.infiniteOptions({
        input: (cursor) => ({ limit: 20, cursor }),
        initialPageParam: undefined as string | undefined,
        getNextPageParam: (last) => last.nextCursor,
      }),
    );
    expectTypeOf(q.data).toEqualTypeOf<
      InfiniteData<Page, string | undefined> | undefined
    >();
  });

  test('pitfall: with no annotation, TPageParam is inferred from `initialPageParam: undefined`', () => {
    trpc.post.list.infiniteOptions({
      input: (cursor) => ({ limit: 20, cursor }),
      initialPageParam: undefined,
      // @ts-expect-error string | undefined is not assignable to undefined | null
      getNextPageParam: (last) => last.nextCursor,
    });
  });

  test('annotating the input parameter also works', () => {
    const q = useInfiniteQuery(
      trpc.post.list.infiniteOptions({
        input: (cursor: string | undefined) => ({ limit: 20, cursor }),
        initialPageParam: undefined,
        getNextPageParam: (last) => last.nextCursor,
      }),
    );
    expectTypeOf(q.data).toEqualTypeOf<
      InfiniteData<Page, string | undefined> | undefined
    >();
  });

  test('any page-param type works, not only an input `cursor`', () => {
    const q = useInfiniteQuery(
      trpc.post.list.infiniteOptions({
        input: (page: number) => ({ limit: 20, cursor: String(page) }),
        initialPageParam: 0,
        getNextPageParam: (_last, _all, lastPage) => lastPage + 1,
      }),
    );
    expectTypeOf(q.data).toEqualTypeOf<
      InfiniteData<Page, number> | undefined
    >();
  });

  test('v11 cursor convention', () => {
    const q = useInfiniteQuery(
      v11.post.list.infiniteQueryOptions(
        { limit: 20 },
        { getNextPageParam: (last) => last.nextCursor },
      ),
    );
    expectTypeOf(q.data).toEqualTypeOf<
      InfiniteData<Page, string | null> | undefined
    >();
  });
});

describe('19: streamedOptions', () => {
  test('data is the accumulated chunks', () => {
    const q = useQuery(
      trpc.chat.stream.streamedOptions({ input: { chatId: 'c' } }),
    );
    expectTypeOf(q.data).toEqualTypeOf<{ text: string }[] | undefined>();
  });
});
