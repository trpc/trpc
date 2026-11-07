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
import type { TRPCClientErrorLike } from '@trpc/client';
import { createTRPCClient, unstable_localLink } from '@trpc/client';
import { initTRPC, TRPCError } from '@trpc/server';
import * as React from 'react';
import { describe, expect, expectTypeOf, test, vi } from 'vitest';
import { z } from 'zod';
import type {
  CreateTRPCHandleContextResult,
  inferInfiniteQueryHandle,
  inferQueryHandle,
  TRPCHandleProxy,
  TRPCLoaderProxy,
} from '.';
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
          "shared/mutationKey.ts",
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
    const [TRPCHandleProvider, useTRPCHandles, useTRPCClient] =
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

  test('createTRPCHandleContext returns a readonly tuple, and useTRPCHandles() has the queries, their keys and the mutations', () => {
    const t = initTRPC.create();
    const appRouter = t.router({
      post: t.router({
        byId: t.procedure.input(z.string()).query(() => 'post'),
        add: t.procedure.input(z.string()).mutation(() => 'added'),
      }),
    });
    const context = createTRPCHandleContext<typeof appRouter>();
    expectTypeOf(context).toEqualTypeOf<
      CreateTRPCHandleContextResult<typeof appRouter>
    >();
    expectTypeOf(context).toMatchTypeOf<readonly unknown[]>();
    expectTypeOf(context).not.toMatchTypeOf<unknown[]>();
    expectTypeOf(context.length).toEqualTypeOf<3>();
    const [, useTRPCHandles] = context;
    if (Math.random() < 2) return;
    const trpc = useTRPCHandles();
    expectTypeOf(trpc.post.byId.queryKey)
      .parameter(0)
      .toEqualTypeOf<string | undefined>();
    // @ts-expect-error read a handle with fromHandle instead
    void trpc.post.byId.queryOptions('1');
    // @ts-expect-error queries have no mutationOptions
    void trpc.post.byId.mutationOptions();

    const addOptions = trpc.post.add.mutationOptions({
      onError: (error) => {
        expectTypeOf(error).toEqualTypeOf<
          TRPCClientErrorLike<typeof appRouter>
        >();
      },
    });
    expectTypeOf(addOptions.mutationKey).toEqualTypeOf<[path: string[]]>();
    expectTypeOf(useMutation(addOptions).mutate)
      .parameter(0)
      .toEqualTypeOf<string>();
    // @ts-expect-error a mutation isn't a query
    waterfallHandle(trpc.post.add, '1');
    // @ts-expect-error nor has queryKey
    void trpc.post.add.queryKey;

    const loader = {} as TRPCLoaderProxy<typeof appRouter>;
    // @ts-expect-error a loader can't run useMutation, so it has no mutations
    void loader.post.add;
    // @ts-expect-error nor can an entry take one
    ensureEntry(trpc.post.add, '1');
  });

  test('a mutation refreshes the infinite handle a loader started', async () => {
    const t = initTRPC.create();
    const comments = ['first'];
    const appRouter = t.router({
      post: t.router({
        comments: t.procedure
          .input(z.object({ postId: z.string(), cursor: z.number().nullish() }))
          .query(() => ({ items: [...comments], nextCursor: null })),
        addComment: t.procedure
          .input(z.object({ postId: z.string(), text: z.string() }))
          .mutation((opts) => {
            if (!opts.input.text) {
              throw new TRPCError({ code: 'BAD_REQUEST' });
            }
            comments.push(opts.input.text);
          }),
      }),
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
    const loader = createTRPCLoaderProxy<AppRouter>({
      router: appRouter,
      ctx: {},
      queryClient,
    });
    const [TRPCHandleProvider, useTRPCHandles] =
      createTRPCHandleContext<AppRouter>();
    const [handles] = await loadHandles(loader, {
      comments: prefetchInfiniteEntry(loader.post.comments, { postId: '1' }),
    });
    const errors: (string | undefined)[] = [];

    function Comments(props: {
      comments: inferInfiniteQueryHandle<
        TRPCHandleProxy<AppRouter>['post']['comments']
      >;
    }) {
      const trpc = useTRPCHandles();
      const qc = useQueryClient();
      const commentsQuery = useSuspenseInfiniteQuery(
        fromHandle(trpc, props.comments, {
          getNextPageParam: (page) => page.nextCursor,
        }),
      );
      const addComment = useMutation(
        trpc.post.addComment.mutationOptions({
          onSuccess: () =>
            qc.invalidateQueries({ queryKey: props.comments.queryKey }),
          onError: (error) => {
            errors.push(error.data?.code);
          },
        }),
      );
      return (
        <div>
          <p>{commentsQuery.data.pages[0]!.items.join(', ')}</p>
          <button
            onClick={() => addComment.mutate({ postId: '1', text: 'second' })}
          >
            add
          </button>
          <button onClick={() => addComment.mutate({ postId: '1', text: '' })}>
            add empty
          </button>
        </div>
      );
    }

    render(
      <QueryClientProvider client={queryClient}>
        <TRPCHandleProvider trpcClient={trpcClient} queryClient={queryClient}>
          <React.Suspense fallback="loading">
            <Comments comments={handles.comments} />
          </React.Suspense>
        </TRPCHandleProvider>
      </QueryClientProvider>,
    );
    expect(await screen.findByText('first')).toBeTruthy();

    fireEvent.click(screen.getByText('add'));
    expect(await screen.findByText('first, second')).toBeTruthy();
    expect(
      queryClient.getMutationCache().getAll()[0]!.options.mutationKey,
    ).toEqual([['post', 'addComment']]);

    fireEvent.click(screen.getByText('add empty'));
    await vi.waitFor(() => expect(errors).toEqual(['BAD_REQUEST']));
  });

  test('the loader proxy has no mutationOptions at runtime either', () => {
    const t = initTRPC.create();
    const appRouter = t.router({
      add: t.procedure.mutation(() => 'added'),
    });
    const loader = createTRPCLoaderProxy({
      router: appRouter,
      ctx: {},
      queryClient: new QueryClient(),
    });
    expect(() =>
      (loader as any).add.mutationOptions(),
    ).toThrowErrorMatchingInlineSnapshot(
      `[TypeError: \`trpc.add.mutationOptions()\` isn't on this handle proxy. It has \`queryKey\`, \`infiniteQueryKey\` and \`pathKey\`, and reads handles with \`fromHandle\`. Mutations are on \`useTRPCHandles()\`]`,
    );
  });
});
