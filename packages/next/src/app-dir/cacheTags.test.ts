import { createTRPCUntypedClient } from '@trpc/client';
import { initTRPC } from '@trpc/server';
import { revalidateTag, unstable_cache } from 'next/cache';
import { vi } from 'vitest';
import { z } from 'zod';
import { experimental_nextCacheLink } from './links/nextCache';
import { experimental_nextHttpLink } from './links/nextHttp';
import {
  experimental_createTRPCNextAppDirServer,
  experimental_revalidateEndpoint,
} from './server';
import { generateCacheTag, generateCacheTags } from './shared';

vi.mock('next/cache', () => ({
  revalidateTag: vi.fn(),
  unstable_cache: vi.fn(
    (fn: any, _keyParts?: string[], _opts?: { tags?: string[] }) => {
      return fn;
    },
  ),
}));

describe('cache tags generation', () => {
  test('generateCacheTag', () => {
    expect(generateCacheTag('page.home.header', undefined)).toBe(
      'page.home.header',
    );
    expect(generateCacheTag('page.home.header', { size: 'medium' })).toBe(
      'page.home.header?input={"size":"medium"}',
    );
    expect(generateCacheTag('posts.byId', 0)).toBe('posts.byId?input=0');
    expect(generateCacheTag('posts.byFlag', false)).toBe(
      'posts.byFlag?input=false',
    );
  });

  test('generateCacheTags with nested procedure and input', () => {
    const tags = generateCacheTags({
      procedurePath: 'page.home.header',
      input: { size: 'medium' },
    });
    expect(tags).toEqual([
      'page',
      'page.home',
      'page.home.header',
      'page.home.header?input={"size":"medium"}',
    ]);
  });

  test('generateCacheTags with nested procedure and no input', () => {
    const tags = generateCacheTags({
      procedurePath: 'page.home.header',
      input: undefined,
    });
    expect(tags).toEqual(['page', 'page.home', 'page.home.header']);
  });

  test('generateCacheTags with null input', () => {
    const tags = generateCacheTags({
      procedurePath: 'page.home.header',
      input: null,
    });
    expect(tags).toEqual([
      'page',
      'page.home',
      'page.home.header',
      'page.home.header?input=null',
    ]);
  });

  test('generateCacheTags with single-level procedure and input', () => {
    const tags = generateCacheTags({
      procedurePath: 'posts',
      input: { limit: 10 },
    });
    expect(tags).toEqual(['posts', 'posts?input={"limit":10}']);
  });

  test('generateCacheTags with falsy input', () => {
    const tags = generateCacheTags({ procedurePath: 'posts.byId', input: 0 });
    expect(tags).toEqual(['posts', 'posts.byId', 'posts.byId?input=0']);
  });

  test('generateCacheTags with empty path returns empty array', () => {
    expect(generateCacheTags({ procedurePath: '', input: undefined })).toEqual(
      [],
    );
  });
});

describe('app-dir server proxy revalidation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const t = initTRPC.create();
  const appRouter = t.router({
    page: t.router({
      home: t.router({
        header: t.procedure
          .input(z.object({ size: z.string() }).optional())
          .query(({ input }) => ({ size: input?.size ?? 'small' })),
      }),
    }),
  });

  const server = experimental_createTRPCNextAppDirServer({
    config: () => ({
      links: [],
    }),
  });

  const trpc = server as unknown as ReturnType<
    typeof experimental_createTRPCNextAppDirServer<typeof appRouter>
  >;

  test('revalidates leaf query with input', async () => {
    const res = await trpc.page.home.header.revalidate({ size: 'medium' });
    expect(res).toEqual({ revalidated: true });
    expect(revalidateTag).toHaveBeenCalledWith(
      'page.home.header?input={"size":"medium"}',
      { expire: 0 },
    );
  });

  test('revalidates leaf query without input', async () => {
    const res = await trpc.page.home.header.revalidate();
    expect(res).toEqual({ revalidated: true });
    expect(revalidateTag).toHaveBeenCalledWith('page.home.header', {
      expire: 0,
    });
  });

  test('revalidates subrouter under home', async () => {
    const res = await trpc.page.home.revalidate();
    expect(res).toEqual({ revalidated: true });
    expect(revalidateTag).toHaveBeenCalledWith('page.home', { expire: 0 });
  });

  test('revalidates top-level router under page', async () => {
    const res = await trpc.page.revalidate();
    expect(res).toEqual({ revalidated: true });
    expect(revalidateTag).toHaveBeenCalledWith('page', { expire: 0 });
  });

  test('returns error when revalidation fails', async () => {
    vi.mocked(revalidateTag).mockImplementationOnce(() => {
      throw new Error('Revalidation failed');
    });
    const res = await trpc.page.revalidate();
    expect(res).toEqual({
      revalidated: false,
      error: 'Revalidation failed',
    });
  });

  test('type inference for subrouter and procedure revalidation', () => {
    expectTypeOf(trpc.page.revalidate).toBeCallableWith();
    expectTypeOf(trpc.page.home.revalidate).toBeCallableWith();
    expectTypeOf(trpc.page.home.header.revalidate).toBeCallableWith();
    expectTypeOf(trpc.page.home.header.revalidate).toBeCallableWith({
      size: 'medium',
    });
    expectTypeOf(trpc.page.home.header.revalidate).toBeCallableWith(undefined);
  });
});

describe('experimental_revalidateEndpoint', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // Next 16 warns about `revalidateTag(tag)` and wants a cache-life profile;
  // `{ expire: 0 }` keeps the immediate expiry that one argument gave
  test('expires the tag immediately', async () => {
    const res = await experimental_revalidateEndpoint(
      new Request('http://localhost/api/revalidate', {
        method: 'POST',
        body: JSON.stringify({ cacheTag: 'posts' }),
      }),
    );
    expect(res.status).toBe(200);
    expect(revalidateTag).toHaveBeenCalledWith('posts', { expire: 0 });
  });
});

describe('app-dir links attach hierarchical tags', () => {
  const t = initTRPC.create();
  const router = t.router({
    page: t.router({
      home: t.router({
        header: t.procedure
          .input(z.object({ size: z.string() }))
          .query(({ input }) => `size:${input.size}`),
      }),
    }),
  });

  test('experimental_nextHttpLink attaches hierarchical cache tags to fetch', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          result: {
            data: 'size:medium',
          },
        }),
        {
          headers: { 'content-type': 'application/json' },
          status: 200,
        },
      ),
    );
    globalThis.fetch = fetchMock;

    const client = createTRPCUntypedClient<typeof router>({
      links: [
        experimental_nextHttpLink({
          url: 'http://localhost:3000/api/trpc',
          batch: false,
        }),
      ],
    });

    await client.query('page.home.header', { size: 'medium' });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [, fetchOpts] = fetchMock.mock.calls[0]!;
    expect(fetchOpts?.next?.tags).toEqual([
      'page',
      'page.home',
      'page.home.header',
      'page.home.header?input={"size":"medium"}',
    ]);
  });

  test('experimental_nextCacheLink attaches hierarchical cache tags to unstable_cache', async () => {
    const unstableCacheMock = vi.fn(
      (fn: any, _keyParts?: string[], _opts?: any) => fn,
    );
    vi.mocked(unstable_cache).mockImplementation(unstableCacheMock as any);

    const client = createTRPCUntypedClient<typeof router>({
      links: [
        experimental_nextCacheLink({
          router,
          createContext: async () => ({}),
        }),
      ],
    });

    await client.query('page.home.header', { size: 'medium' });

    expect(unstableCacheMock).toHaveBeenCalled();
    const callArgs = unstableCacheMock.mock.calls[0]!;
    expect(callArgs[1]).toEqual(['page', 'home', 'header']);
    expect(callArgs[2]).toMatchObject({
      tags: [
        'page',
        'page.home',
        'page.home.header',
        'page.home.header?input={"size":"medium"}',
      ],
    });
  });
});
