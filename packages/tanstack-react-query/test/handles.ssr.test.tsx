// @vitest-environment node
import { PassThrough } from 'node:stream';
import { text } from 'node:stream/consumers';
import { testServerAndClientResource } from '@trpc/client/__tests__/testClientResource';
import {
  defaultShouldDehydrateQuery,
  dehydrate,
  HydrationBoundary,
  QueryClient,
  QueryClientProvider,
  useSuspenseQuery,
} from '@tanstack/react-query';
import type { DehydratedState } from '@tanstack/react-query';
import { initTRPC } from '@trpc/server';
import * as React from 'react';
import { renderToPipeableStream } from 'react-dom/server';
import superjson from 'superjson';
import { describe, expect, test, vi } from 'vitest';
import { z } from 'zod';
import type { TRPCOptionsProxy, unstable_inferQueryHandle } from '../src';
import {
  createTRPCContext,
  createTRPCOptionsProxy,
  usePrefetchHandles,
} from '../src';

const ctx = () => {
  const t = initTRPC.create({ transformer: superjson });
  const calls = vi.fn();
  const appRouter = t.router({
    post: t.router({
      byDay: t.procedure.input(z.object({ day: z.date() })).query((opts) => {
        calls(opts.input);
        return {
          title: `Posts on ${opts.input.day.toISOString().slice(0, 10)}`,
          fetchedAt: new Date(0),
        };
      }),
    }),
  });
  const resource = testServerAndClientResource(appRouter);
  return { ...resource, calls, appRouter };
};

type AppRouter = ReturnType<typeof ctx>['appRouter'];
type TRPC = TRPCOptionsProxy<AppRouter>;

/** The request-scoped server side: an in-process proxy that mints handles */
function makeServer(resource: ReturnType<typeof ctx>) {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { staleTime: 30_000 },
      dehydrate: {
        serializeData: superjson.serialize,
        shouldDehydrateQuery: (query) =>
          defaultShouldDehydrateQuery(query) ||
          query.state.status === 'pending',
      },
    },
  });
  const trpc = createTRPCOptionsProxy({
    router: resource.appRouter,
    ctx: {},
    queryClient,
  });
  return { queryClient, trpc };
}

/** Server-render the client tree, the way Next.js renders client components */
async function renderClientTree(
  resource: ReturnType<typeof ctx>,
  state: DehydratedState | undefined,
  children: React.ReactNode,
) {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { staleTime: 30_000 },
      hydrate: { deserializeData: superjson.deserialize },
    },
  });
  const { TRPCProvider } = trpcContext;
  const output = new PassThrough();
  const html = text(output);
  await new Promise<void>((resolve, reject) => {
    const { pipe } = renderToPipeableStream(
      <QueryClientProvider client={queryClient}>
        <TRPCProvider trpcClient={resource.client} queryClient={queryClient}>
          <HydrationBoundary state={state}>
            <React.Suspense fallback="loading">{children}</React.Suspense>
          </HydrationBoundary>
        </TRPCProvider>
      </QueryClientProvider>,
      {
        onAllReady() {
          pipe(output);
          resolve();
        },
        onShellError: reject,
      },
    );
  });
  return html;
}

const trpcContext = createTRPCContext<AppRouter>();

function trpcWarnings(warn: { mock: { calls: unknown[][] } }) {
  return warn.mock.calls
    .map(([message]) => String(message))
    .filter((message) => message.startsWith('[@trpc/tanstack-react-query]'));
}

function Post(props: {
  post: unstable_inferQueryHandle<TRPC['post']['byDay']>;
}) {
  const trpc = trpcContext.useTRPC();
  const { data } = useSuspenseQuery(trpc.unstable_fromHandle(props.post));
  return <p>{`${data.title} fetchedAt:${data.fetchedAt.toISOString()}`}</p>;
}

describe('server rendering', () => {
  test('renders ensured and pending handles from the dehydrated state, without fetching again', async () => {
    await using resource = ctx();
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const server = makeServer(resource);

    const ensured = await server.trpc.post.byDay.unstable_ensure({
      day: new Date('2026-01-01'),
    });
    const pending = server.trpc.post.byDay.unstable_prefetch({
      day: new Date('2026-01-02'),
    });
    const state = dehydrate(server.queryClient);
    expect(state.queries.map((query) => query.state.status)).toEqual([
      'success',
      'pending',
    ]);

    // Handles cross as framework data: Flight and seroval keep the `Date` in the input
    const props = structuredClone({ ensured, pending });

    const html = await renderClientTree(
      resource,
      state,
      <>
        <Post post={props.ensured} />
        <Post post={props.pending} />
      </>,
    );

    expect(html).toContain('Posts on 2026-01-01');
    expect(html).toContain('Posts on 2026-01-02');
    expect(html).toContain('fetchedAt:1970-01-01T00:00:00.000Z');
    expect(resource.calls).toHaveBeenCalledTimes(2);
    expect(trpcWarnings(warn)).toEqual([]);
    warn.mockRestore();
  });

  test('usePrefetchHandles starts its queries in the server render', async () => {
    await using resource = ctx();
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    function Page() {
      const trpc = trpcContext.useTRPC();
      const handles = usePrefetchHandles(() => ({
        a: trpc.post.byDay.unstable_prefetch({ day: new Date('2026-03-01') }),
        b: trpc.post.byDay.unstable_prefetch({ day: new Date('2026-03-02') }),
      }));
      return (
        <>
          <Post post={handles.a} />
          <Post post={handles.b} />
        </>
      );
    }

    const html = await renderClientTree(resource, undefined, <Page />);
    expect(html).toContain('Posts on 2026-03-01');
    expect(html).toContain('Posts on 2026-03-02');
    expect(resource.calls).toHaveBeenCalledTimes(2);
    expect(trpcWarnings(warn)).toEqual([]);
    warn.mockRestore();
  });

  test('warns once when a handle is read during server rendering without hydration', async () => {
    await using resource = ctx();
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const server = makeServer(resource);
    const handle = await server.trpc.post.byDay.unstable_ensure({
      day: new Date('2026-02-01'),
    });

    // No dehydrated state: the client tree has to fetch the query again
    const render = () =>
      renderClientTree(resource, undefined, <Post post={handle} />);
    expect(await render()).toContain('Posts on 2026-02-01');
    expect(await render()).toContain('Posts on 2026-02-01');

    expect(resource.calls).toHaveBeenCalledTimes(3);
    expect(trpcWarnings(warn)).toHaveLength(1);
    expect(trpcWarnings(warn)[0]).toContain(
      'The handle for "post.byDay" is being fetched again during server rendering',
    );
    warn.mockRestore();
  });
});
