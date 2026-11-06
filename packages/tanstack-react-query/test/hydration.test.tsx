// @vitest-environment node
import { PassThrough } from 'node:stream';
import { text } from 'node:stream/consumers';
import { testServerAndClientResource } from '@trpc/client/__tests__/testClientResource';
import type { DehydratedState } from '@tanstack/react-query';
import {
  defaultShouldDehydrateQuery,
  HydrationBoundary,
  QueryClient,
  QueryClientProvider,
  useSuspenseQuery,
} from '@tanstack/react-query';
import { initTRPC, TRPCError } from '@trpc/server';
import * as React from 'react';
import { renderToPipeableStream, renderToString } from 'react-dom/server';
import superjson from 'superjson';
import { describe, expect, test, vi } from 'vitest';
import { z } from 'zod';
import {
  unstable_createHydrateClient as createClientHydrateClient,
  createTRPCContext,
} from '../src';
import * as rsc from '../src/index.react-server';

const ctx = () => {
  const t = initTRPC.create({ transformer: superjson });
  const calls = vi.fn();
  let version = 0;
  const appRouter = t.router({
    post: t.router({
      byDay: t.procedure.input(z.object({ day: z.date() })).query((opts) => {
        calls(opts.input);
        version++;
        return {
          title: `Posts on ${opts.input.day.toISOString().slice(0, 10)}`,
          version,
          fetchedAt: new Date(0),
        };
      }),
      list: t.procedure
        .input(z.object({ cursor: z.number().nullish() }))
        .query((opts) => {
          calls(opts.input);
          const cursor = opts.input.cursor ?? 0;
          return { items: [cursor, cursor + 1], nextCursor: cursor + 2 };
        }),
      missing: t.procedure.query(() => {
        throw new TRPCError({ code: 'NOT_FOUND' });
      }),
    }),
  });
  const resource = testServerAndClientResource(appRouter);
  return { ...resource, calls, appRouter };
};

type AppRouter = ReturnType<typeof ctx>['appRouter'];

function makeServerQueryClient() {
  return new QueryClient({
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
}

function makeBrowserQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: { staleTime: 30_000 },
      hydrate: { deserializeData: superjson.deserialize },
    },
  });
}

/** The request-scoped server side, with the `react-server` build */
function makeServer(resource: ReturnType<typeof ctx>) {
  const queryClient = makeServerQueryClient();
  const trpc = rsc.createTRPCOptionsProxy({
    router: resource.appRouter,
    ctx: {},
    queryClient,
  });
  return { queryClient, trpc };
}

const trpcContext = createTRPCContext<AppRouter>();

/** Server-render client components, the way Next.js renders them after the RSC pass */
async function renderClientTree(
  resource: ReturnType<typeof ctx>,
  children: React.ReactNode,
  queryClient = makeBrowserQueryClient(),
) {
  const { TRPCProvider } = trpcContext;
  const output = new PassThrough();
  const html = text(output);
  await new Promise<void>((resolve, reject) => {
    const { pipe } = renderToPipeableStream(
      <QueryClientProvider client={queryClient}>
        <TRPCProvider trpcClient={resource.client} queryClient={queryClient}>
          <React.Suspense fallback="loading">{children}</React.Suspense>
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

function trpcWarnings(warn: { mock: { calls: unknown[][] } }) {
  return warn.mock.calls
    .map(([message]) => String(message))
    .filter((message) => message.startsWith('[@trpc/tanstack-react-query]'));
}

/** What a server-build `HydrateClient` sends when it renders */
function sentBy(queryClient: QueryClient | (() => QueryClient)) {
  const HydrateClient = rsc.unstable_createHydrateClient(queryClient);
  const element = (HydrateClient as (props: object) => React.ReactNode)(
    {},
  ) as React.ReactElement<{ state: DehydratedState }>;
  return element.props.state;
}

function hashes(state: DehydratedState) {
  return state.queries.map((query) => query.queryHash);
}

function Post(props: { day: Date }) {
  const trpc = trpcContext.useTRPC();
  const postQuery = useSuspenseQuery(
    trpc.post.byDay.queryOptions({ day: props.day }),
  );
  const post = postQuery.data;
  return (
    <p>{`${post.title} v${post.version} fetchedAt:${post.fetchedAt.toISOString()}`}</p>
  );
}

describe('unstable_createHydrateClient in server components', () => {
  test('nested boundaries send each query once', async () => {
    await using resource = ctx();
    const server = makeServer(resource);

    const a = server.trpc.post.byDay.queryKey({ day: new Date('2026-01-01') });
    void server.queryClient.prefetchQuery(
      server.trpc.post.byDay.queryOptions({ day: new Date('2026-01-01') }),
    );
    const outer = sentBy(server.queryClient);
    expect(outer.queries).toHaveLength(1);
    expect(outer.queries[0]!.state.status).toBe('pending');

    // A nested server component starts another query
    await server.queryClient.ensureQueryData(
      server.trpc.post.byDay.queryOptions({ day: new Date('2026-01-02') }),
    );
    const inner = sentBy(server.queryClient);
    expect(inner.queries).toHaveLength(1);
    expect(inner.queries[0]!.queryKey).toEqual(
      server.trpc.post.byDay.queryKey({ day: new Date('2026-01-02') }),
    );

    // The first query has settled since, but the promise the outer boundary sent resolves with it
    await server.queryClient.ensureQueryData(
      server.trpc.post.byDay.queryOptions({ day: new Date('2026-01-01') }),
    );
    expect(server.queryClient.getQueryState(a)?.status).toBe('success');
    expect(sentBy(server.queryClient).queries).toEqual([]);
  });

  test('sends a query again when the server has newer data for it', async () => {
    await using resource = ctx();
    const server = makeServer(resource);
    const opts = server.trpc.post.byDay.queryOptions({
      day: new Date('2026-01-01'),
    });

    await server.queryClient.ensureQueryData(
      server.trpc.post.byDay.queryOptions({ day: new Date('2026-01-01') }),
    );
    expect(hashes(sentBy(server.queryClient))).toHaveLength(1);

    await new Promise((resolve) => setTimeout(resolve, 2));
    await server.queryClient.fetchQuery({ ...opts, staleTime: 0 });
    const resent = sentBy(server.queryClient);
    expect(resent.queries).toHaveLength(1);
    expect(
      superjson.deserialize(resent.queries[0]!.state.data as any),
    ).toMatchObject({
      version: 2,
    });
  });

  test("keeps the client's dehydrate filter, and doesn't mark filtered queries as sent", async () => {
    await using resource = ctx();
    const server = makeServer(resource);
    server.queryClient.setDefaultOptions({
      ...server.queryClient.getDefaultOptions(),
      dehydrate: {
        ...server.queryClient.getDefaultOptions().dehydrate,
        shouldDehydrateQuery: defaultShouldDehydrateQuery,
      },
    });

    void server.queryClient.prefetchQuery(
      server.trpc.post.byDay.queryOptions({ day: new Date('2026-01-01') }),
    );
    expect(sentBy(server.queryClient).queries).toEqual([]);

    await server.queryClient.ensureQueryData(
      server.trpc.post.byDay.queryOptions({ day: new Date('2026-01-01') }),
    );
    expect(sentBy(server.queryClient).queries).toHaveLength(1);
  });

  test('each request client starts over', async () => {
    await using resource = ctx();
    const first = makeServer(resource);
    const second = makeServer(resource);
    await first.queryClient.ensureQueryData(
      first.trpc.post.byDay.queryOptions({ day: new Date('2026-01-01') }),
    );
    await second.queryClient.ensureQueryData(
      second.trpc.post.byDay.queryOptions({ day: new Date('2026-01-01') }),
    );

    expect(sentBy(first.queryClient).queries).toHaveLength(1);
    expect(sentBy(second.queryClient).queries).toHaveLength(1);
  });

  test('hydrates the client tree from nested boundaries without fetching again', async () => {
    await using resource = ctx();
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const server = makeServer(resource);

    void server.queryClient.prefetchQuery(
      server.trpc.post.byDay.queryOptions({ day: new Date('2026-01-01') }),
    );
    const outerState = sentBy(server.queryClient);
    await server.queryClient.ensureQueryData(
      server.trpc.post.byDay.queryOptions({ day: new Date('2026-01-02') }),
    );
    const innerState = sentBy(server.queryClient);

    const html = await renderClientTree(
      resource,
      <HydrationBoundary state={outerState}>
        <Post day={new Date('2026-01-01')} />
        <HydrationBoundary state={innerState}>
          <Post day={new Date('2026-01-02')} />
        </HydrationBoundary>
      </HydrationBoundary>,
    );

    expect(html).toContain('Posts on 2026-01-01');
    expect(html).toContain('Posts on 2026-01-02');
    expect(resource.calls).toHaveBeenCalledTimes(2);
    expect(trpcWarnings(warn)).toEqual([]);
    warn.mockRestore();
  });

  test('takes a lazy query client, like `createTRPCOptionsProxy`', async () => {
    await using resource = ctx();
    const server = makeServer(resource);
    await server.queryClient.ensureQueryData(
      server.trpc.post.byDay.queryOptions({ day: new Date('2026-01-01') }),
    );

    expect(sentBy(() => server.queryClient).queries).toHaveLength(1);
    expect(sentBy(() => server.queryClient).queries).toEqual([]);
  });
});

describe('unstable_createHydrateClient outside server components', () => {
  test('throws when rendered, not when created', () => {
    const HydrateClient = createClientHydrateClient(makeServerQueryClient());
    expect(() =>
      renderToString(
        <HydrateClient>
          <p />
        </HydrateClient>,
      ),
    ).toThrow(
      '`HydrateClient` from `unstable_createHydrateClient()` works only in React Server Components',
    );
  });
});
