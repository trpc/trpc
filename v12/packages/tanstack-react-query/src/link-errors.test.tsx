// @vitest-environment happy-dom
import {
  QueryClient,
  QueryClientProvider,
  useQuery,
} from '@tanstack/react-query';
import { createTrpcContext } from '@trpc12/tanstack-react-query';
import {
  createTrpcClient,
  httpLink,
  localLink,
  matchError,
  routerType,
  type LinkErrorCode,
} from '@trpc12/trpc/client';
import { error, initTrpc } from '@trpc12/trpc/server';
import { createRoot } from 'react-dom/client';
import { expect, expectTypeOf, test } from 'vite-plus/test';
import { container, text, waitFor } from '../../trpc/src/fixtures/dom.ts';

const t = initTrpc();
const router = t.router({
  missing: t.procedure.query(() => error({ code: 'NOT_FOUND' })),
});

const inProcess = () =>
  createTrpcClient({
    router: routerType<typeof router>(),
    links: [localLink({ router })],
  });
const overHttp = () =>
  createTrpcClient({
    router: routerType<typeof router>(),
    links: [httpLink({ url: 'http://127.0.0.1:1/trpc' })],
  });

type CodesOf<E> = E extends { readonly code: infer C } ? C : never;

test("useQuery's error has only the link codes of the client's links", async () => {
  const local = createTrpcContext<ReturnType<typeof inProcess>>();
  const remote = createTrpcContext<ReturnType<typeof overHttp>>();

  function Local() {
    const trpc = local[1]();
    const query = useQuery(trpc.missing.queryOptions());
    expectTypeOf<
      Extract<CodesOf<NonNullable<typeof query.error>>, LinkErrorCode>
    >().toBeNever();
    if (!query.error) return <p>loading</p>;
    return (
      <p className="error">
        {matchError(query.error, {
          NOT_FOUND: () => 'missing',
          unexpected: (e) => e.code,
        })}
      </p>
    );
  }

  function Remote() {
    const trpc = remote[1]();
    const query = useQuery(trpc.missing.queryOptions());
    expectTypeOf<
      Extract<CodesOf<NonNullable<typeof query.error>>, LinkErrorCode>
    >().toEqualTypeOf<Exclude<LinkErrorCode, 'STREAM_INTERRUPTED'>>();
    if (!query.error) return <p>loading</p>;
    return (
      <p className="error">
        {matchError(query.error, {
          NOT_FOUND: () => 'missing',
          NETWORK_ERROR: () => 'offline',
          BAD_RESPONSE: (e) => e.code,
          unexpected: (e) => e.code,
        })}
      </p>
    );
  }

  // Both clients' calls share query keys, so each gets its own cache.
  const cache = () =>
    new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const el = container();
  const root = createRoot(el);
  const [LocalProvider] = local;
  const [RemoteProvider] = remote;
  root.render(
    <>
      <QueryClientProvider client={cache()}>
        <LocalProvider client={inProcess()}>
          <div id="local">
            <Local />
          </div>
        </LocalProvider>
      </QueryClientProvider>
      <QueryClientProvider client={cache()}>
        <RemoteProvider client={overHttp()}>
          <div id="remote">
            <Remote />
          </div>
        </RemoteProvider>
      </QueryClientProvider>
    </>,
  );
  try {
    await waitFor(() => expect(text(el, '#local .error')).toBe('missing'));
    await waitFor(() => expect(text(el, '#remote .error')).toBe('offline'));
  } finally {
    root.unmount();
    el.remove();
  }
});

test("useQuery's error is TIMEOUT when the call's fetch times out, for matchError()'s unexpected", async () => {
  const timingOut = () =>
    createTrpcClient({
      router: routerType<typeof router>(),
      links: [
        httpLink({
          url: 'http://127.0.0.1:1/trpc',
          fetch: () =>
            new Promise<Response>((_resolve, reject) => {
              const signal = AbortSignal.timeout(20);
              signal.addEventListener('abort', () => reject(signal.reason));
            }),
        }),
      ],
    });
  const remote = createTrpcContext<ReturnType<typeof timingOut>>();

  function Remote() {
    const trpc = remote[1]();
    const query = useQuery(trpc.missing.queryOptions());
    expectTypeOf<
      Extract<CodesOf<NonNullable<typeof query.error>>, 'TIMEOUT'>
    >().toEqualTypeOf<'TIMEOUT'>();
    if (!query.error) return <p>loading</p>;
    return (
      <p className="error">
        {matchError(query.error, {
          NOT_FOUND: () => 'missing',
          NETWORK_ERROR: () => 'offline',
          BAD_RESPONSE: (e) => e.code,
          unexpected: (e) =>
            e.code === 'TIMEOUT' ? 'took too long' : `unexpected ${e.code}`,
        })}
      </p>
    );
  }

  const el = container();
  const root = createRoot(el);
  const [RemoteProvider] = remote;
  root.render(
    <QueryClientProvider
      client={
        new QueryClient({ defaultOptions: { queries: { retry: false } } })
      }
    >
      <RemoteProvider client={timingOut()}>
        <Remote />
      </RemoteProvider>
    </QueryClientProvider>,
  );
  try {
    await waitFor(() => expect(text(el, '.error')).toBe('took too long'));
  } finally {
    root.unmount();
    el.remove();
  }
});
