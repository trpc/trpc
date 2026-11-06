import { readFileSync } from 'node:fs';
import path from 'node:path';
import {
  QueryClient,
  QueryClientProvider,
  useMutation,
  useQueryClient,
  useSuspenseInfiniteQuery,
  useSuspenseQuery,
} from '@tanstack/react-query';
import { fireEvent, render, screen } from '@testing-library/react';
import { createTRPCClient, unstable_localLink } from '@trpc/client';
import { initTRPC } from '@trpc/server';
import * as React from 'react';
import { describe, expect, expectTypeOf, test } from 'vitest';
import { z } from 'zod';
import type { inferQueryHandle, TRPCLoaderProxy } from '.';
import {
  createTRPCHandleContext,
  createTRPCLoaderProxy,
  ensureEntry,
  fromHandle,
  loadHandles,
  prefetchInfiniteEntry,
  waterfallHandle,
} from '.';

const srcDir = path.resolve(__dirname, '..');

function localImports(file: string) {
  const source = readFileSync(file, 'utf8');
  const specifiers = [
    ...source.matchAll(/(?:from|import)\s*\(?\s*'(\.[^']*)'/g),
  ].map((match) => match[1]!);
  return specifiers.map((specifier) => {
    const base = path.resolve(path.dirname(file), specifier);
    const candidates = [`${base}.ts`, `${base}.tsx`, `${base}/index.ts`];
    const found = candidates.find((candidate) => {
      try {
        readFileSync(candidate);
        return true;
      } catch {
        return false;
      }
    });
    if (!found) {
      throw new Error(`Can't resolve ${specifier} from ${file}`);
    }
    return found;
  });
}

function moduleGraph(entry: string) {
  const seen = new Set<string>();
  const queue = [entry];
  while (queue.length) {
    const file = queue.pop()!;
    if (!seen.has(file)) {
      seen.add(file);
      queue.push(...localImports(file));
    }
  }
  return [...seen].map((file) => path.relative(srcDir, file)).sort();
}

describe('standalone', () => {
  test('unstable-handles imports nothing from the rest of the package', () => {
    expect(moduleGraph(path.join(srcDir, 'unstable-handles/index.ts')))
      .toMatchInlineSnapshot(`
        Array [
          "shared/queryFn.ts",
          "shared/queryKey.ts",
          "unstable-handles/context.tsx",
          "unstable-handles/entryError.ts",
          "unstable-handles/handles.ts",
          "unstable-handles/index.ts",
          "unstable-handles/proxy.ts",
          "unstable-handles/types.ts",
        ]
      `);
  });

  test('loads handles and reads them with only unstable-handles', async () => {
    const t = initTRPC.create();
    const posts = new Map([['1', { id: '1', title: 'Hello' }]]);
    const appRouter = t.router({
      post: t.router({
        byId: t.procedure
          .input(z.object({ id: z.string() }))
          .query((opts) => posts.get(opts.input.id)!),
        comments: t.procedure
          .input(z.object({ postId: z.string(), cursor: z.number().nullish() }))
          .query((opts) => ({
            items: [`comment on ${opts.input.postId}`],
            nextCursor: null,
          })),
        rename: t.procedure
          .input(z.object({ id: z.string(), title: z.string() }))
          .mutation((opts) => {
            posts.set(opts.input.id, opts.input);
          }),
      }),
      viewer: t.procedure.query(() => ({ id: '1' })),
    });
    type AppRouter = typeof appRouter;

    const queryClient = new QueryClient();
    const trpcClient = createTRPCClient<AppRouter>({
      links: [
        unstable_localLink({
          router: appRouter,
          createContext: async () => ({}),
        }),
      ],
    });
    const loader: TRPCLoaderProxy<AppRouter> = createTRPCLoaderProxy({
      router: appRouter,
      ctx: {},
      queryClient,
    });
    const { TRPCHandleProvider, useTRPCHandles, useTRPCClient } =
      createTRPCHandleContext<AppRouter>();

    const [handles, data] = await loadHandles(loader, {
      post: ensureEntry(loader.post.byId, { id: '1' }),
      comments: prefetchInfiniteEntry(loader.post.comments, { postId: '1' }),
    });
    expect(data.post.title).toBe('Hello');

    function Post(props: {
      post: inferQueryHandle<TRPCLoaderProxy<AppRouter>['post']['byId']>;
    }) {
      const trpc = useTRPCHandles();
      const client = useTRPCClient();
      const qc = useQueryClient();
      const postQuery = useSuspenseQuery(fromHandle(trpc, props.post));
      const commentsQuery = useSuspenseInfiniteQuery(
        fromHandle(trpc, handles.comments, {
          getNextPageParam: (page) => page.nextCursor,
        }),
      );
      const viewerQuery = useSuspenseQuery(
        fromHandle(trpc, waterfallHandle(trpc.viewer)),
      );
      const rename = useMutation({
        mutationFn: (title: string) =>
          client.post.rename.mutate({ id: '1', title }),
        onSuccess: () =>
          qc.invalidateQueries({ queryKey: trpc.post.byId.queryKey() }),
      });
      return (
        <div>
          <p>
            {postQuery.data.title} by {viewerQuery.data.id}
          </p>
          <p>{commentsQuery.data.pages[0]!.items[0]}</p>
          <button onClick={() => rename.mutate('Renamed')}>rename</button>
        </div>
      );
    }

    render(
      <QueryClientProvider client={queryClient}>
        <TRPCHandleProvider trpcClient={trpcClient} queryClient={queryClient}>
          <React.Suspense fallback="loading">
            <Post post={handles.post} />
          </React.Suspense>
        </TRPCHandleProvider>
      </QueryClientProvider>,
    );
    expect(await screen.findByText('Hello by 1')).toBeTruthy();
    expect(screen.getByText('comment on 1')).toBeTruthy();

    fireEvent.click(screen.getByText('rename'));
    expect(await screen.findByText('Renamed by 1')).toBeTruthy();
  });

  test('useTRPCHandles() has only the queries and their keys', () => {
    const t = initTRPC.create();
    const appRouter = t.router({
      post: t.router({
        byId: t.procedure.input(z.string()).query(() => 'post'),
        add: t.procedure.input(z.string()).mutation(() => 'added'),
      }),
    });
    const { useTRPCHandles } = createTRPCHandleContext<typeof appRouter>();
    if (Math.random() < 2) return;
    const trpc = useTRPCHandles();
    expectTypeOf(trpc.post.byId.queryKey)
      .parameter(0)
      .toEqualTypeOf<string | undefined>();
    // @ts-expect-error mutations are for useTRPCClient()
    void trpc.post.add;
    // @ts-expect-error read a handle with fromHandle instead
    void trpc.post.byId.queryOptions('1');
  });
});
