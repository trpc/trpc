import { Effect, Schema, Stream } from 'effect';
import {
  createTrpcClient,
  experimental_validationLink,
  httpLink,
  link,
  localLink,
  matchError,
  retryLink,
  routerType,
  safe,
  splitLink,
  TrpcError,
  wsLink,
  type BuiltinError,
  type ClientError,
  type LinkErrorCode,
  type TrpcClient,
} from '@trpc12/trpc/client';
import { createEffectClient } from '@trpc12/trpc/effect';
import { experimental_openApiLink } from '@trpc12/trpc/openapi';
import {
  createRouterClient,
  initTrpc,
  type inferProcedureErrors,
} from '@trpc12/trpc/server';
import { createTestServer } from '../../fixtures/server.ts';
import { expect, expectTypeOf, test } from 'vite-plus/test';
import { z } from 'zod';

const t = initTrpc();
const router = t.router({
  echo: t.procedure.input(z.string()).query((opts) => opts.input),
  ping: t.procedure.query(() => 'pong'),
  ticks: t.procedure.subscription(async function* () {
    yield 1;
  }),
  feed: t.procedure.query(async function* () {
    yield 1;
  }),
  digest: t.procedure.query(() => ({ later: Promise.resolve(1) })),
});
type AppRouter = typeof router;

type ErrorOf<P> = P extends (...args: any[]) => { '~error'?: infer E }
  ? E
  : never;
type CodesOf<E> = E extends { readonly code: infer C } ? C : never;
type LinkCodesIn<E> = Extract<CodesOf<E>, LinkErrorCode>;

const typed = <T>(links: T) => links;
const http = httpLink({ url: 'http://localhost/trpc' });
const local = localLink({ router });

type Unstreamed = Exclude<LinkErrorCode, 'STREAM_INTERRUPTED'>;

test("a call's union has the link codes its links declare, and no others", () => {
  const overHttp = createTrpcClient({
    router: routerType<AppRouter>(),
    links: [retryLink(), http],
  });
  expectTypeOf<
    LinkCodesIn<ErrorOf<typeof overHttp.echo.query>>
  >().toEqualTypeOf<Unstreamed>();

  const inProcess = createTrpcClient({
    router: routerType<AppRouter>(),
    links: typed([local]),
  });
  type Local = ErrorOf<typeof inProcess.echo.query>;
  expectTypeOf<LinkCodesIn<Local>>().toBeNever();
  // The catch-all is still there: crashes, aborts, a missing procedure.
  expectTypeOf<
    Extract<CodesOf<Local>, 'INTERNAL_SERVER_ERROR' | 'CLIENT_CLOSED_REQUEST'>
  >().toEqualTypeOf<'INTERNAL_SERVER_ERROR' | 'CLIENT_CLOSED_REQUEST'>();

  const checked = createTrpcClient({
    router: routerType<AppRouter>(),
    links: [experimental_validationLink({ contract: router as never }), local],
  });
  expectTypeOf<
    LinkCodesIn<ErrorOf<typeof checked.echo.query>>
  >().toEqualTypeOf<'BAD_RESPONSE'>();

  const ws = wsLink({ url: 'ws://localhost/trpc' });
  const split = createTrpcClient({
    router: routerType<AppRouter>(),
    links: [
      splitLink({
        condition: (op) => op.type === 'subscription',
        true: ws,
        false: local,
      }),
    ],
  });
  expectTypeOf<
    LinkCodesIn<ErrorOf<typeof split.ticks.subscribe>>
  >().toEqualTypeOf<LinkErrorCode>();
  void ws[Symbol.asyncDispose]();

  const rest = createTrpcClient({
    router: routerType<AppRouter>(),
    links: [
      experimental_openApiLink({
        url: 'http://localhost',
        contract: { procedures: {} } as never,
      }),
    ],
  });
  expectTypeOf<LinkCodesIn<ErrorOf<typeof rest.echo.query>>>().toEqualTypeOf<
    'NETWORK_ERROR' | 'BAD_RESPONSE'
  >();

  const caller = createRouterClient(router);
  expectTypeOf<LinkCodesIn<ErrorOf<typeof caller.echo.query>>>().toBeNever();

  // A client typed without its links could have come from any chain.
  expectTypeOf(inProcess).toExtend<TrpcClient<AppRouter>>();
  expectTypeOf(overHttp).toExtend<TrpcClient<AppRouter>>();
  expectTypeOf<
    LinkCodesIn<ErrorOf<TrpcClient<AppRouter>['echo']['query']>>
  >().toEqualTypeOf<Unstreamed>();
  expectTypeOf<
    LinkCodesIn<ClientError<inferProcedureErrors<AppRouter['echo']>>>
  >().toEqualTypeOf<LinkErrorCode>();
});

test('a custom link declares the link codes it makes', async () => {
  const offline = link<{ builtinErrors: 'NETWORK_ERROR' }>(() =>
    Stream.fail(new TrpcError.NetworkError({ message: 'offline' })),
  );
  const client = createTrpcClient({
    router: routerType<AppRouter>(),
    links: [offline, local],
  });
  const [, err] = await safe(client.ping.query());
  expectTypeOf<LinkCodesIn<typeof err>>().toEqualTypeOf<'NETWORK_ERROR'>();
  expect(err).toMatchObject({ code: 'NETWORK_ERROR', defined: false });

  const effectClient = createEffectClient({
    router: routerType<AppRouter>(),
    links: [offline, local],
  });
  const code = await Effect.runPromise(
    effectClient.ping.query().pipe(
      Effect.map(() => 'ok'),
      Effect.catchTag('NetworkError', (e) => Effect.succeed(e.code)),
      Effect.catch((e) => Effect.succeed(e.code)),
    ),
  );
  expect(code).toBe('NETWORK_ERROR');
  type EffectError = Effect.Error<ReturnType<typeof effectClient.ping.query>>;
  expectTypeOf<LinkCodesIn<EffectError>>().toEqualTypeOf<'NETWORK_ERROR'>();
});

test('every link code the client declares is a required key', async () => {
  await using server = await createTestServer({ router });
  const client = createTrpcClient({
    router: routerType<AppRouter>(),
    links: [
      httpLink({
        url: server.url,
        fetch: async (input, init) => {
          const request = new Request(input, init);
          if (request.url.includes('down')) throw new TypeError('offline');
          if (request.url.includes('busy')) {
            return new Response('busy', { status: 503 });
          }
          return fetch(input, init);
        },
      }),
    ],
  });
  const explain = async (input: string) => {
    const [, err] = await safe(client.echo.query(input));
    if (!err) return 'ok';
    return matchError(err, {
      BAD_REQUEST: () => 'invalid',
      NETWORK_ERROR: (e) => {
        expectTypeOf(e.code).toEqualTypeOf<'NETWORK_ERROR'>();
        return 'offline';
      },
      BAD_RESPONSE: () => 'unreadable',
      unexpected: (e) => `unexpected ${e.code}`,
    });
  };
  expect(await explain('fine')).toBe('ok');
  expect(await explain('down')).toBe('offline');
  expect(await explain('busy')).toBe('unexpected SERVICE_UNAVAILABLE');

  const [, err] = await safe(client.echo.query('down'));
  // @ts-expect-error: NETWORK_ERROR and BAD_RESPONSE are missing
  matchError(err!, {
    BAD_REQUEST: () => 'invalid',
    unexpected: (e: { code: string }) => `unexpected ${e.code}`,
  });
});

test("httpLink fails with the codes it declares: a body that isn't JSON is BAD_RESPONSE", async () => {
  const answering = (response: () => Promise<Response>) =>
    createTrpcClient({
      router: routerType<AppRouter>(),
      links: [httpLink({ url: 'http://localhost/trpc', fetch: response })],
    });
  const [, html] = await safe(
    answering(async () => new Response('<html>ok</html>')).ping.query(),
  );
  expect(html).toMatchObject({
    code: 'BAD_RESPONSE',
    message: 'Invalid response body',
  });
  const [, down] = await safe(
    answering(() => Promise.reject(new TypeError('offline'))).ping.query(),
  );
  expect(down).toMatchObject({ code: 'NETWORK_ERROR', message: 'offline' });
});

test('matchError takes keys only for the link codes in the union', () => {
  const inProcess = createTrpcClient({
    router: routerType<AppRouter>(),
    links: [local],
  });
  type Local = ErrorOf<typeof inProcess.ping.query>;
  const err = new TrpcError.InternalServerError() as Local;
  expect(matchError(err, { unexpected: (e) => e.code })).toBe(
    'INTERNAL_SERVER_ERROR',
  );
  matchError(err, {
    // @ts-expect-error: localLink makes no NETWORK_ERROR
    NETWORK_ERROR: () => 'offline',
    unexpected: (e) => e.code,
  });

  // With only link codes left, so is `unexpected`.
  type OnlyLinks = BuiltinError<LinkErrorCode>;
  const lost = new TrpcError.NetworkError() as OnlyLinks;
  expect(
    matchError(lost, {
      NETWORK_ERROR: () => 'offline',
      BAD_RESPONSE: () => 'bad',
      STREAM_INTERRUPTED: () => 'cut',
    }),
  ).toBe('offline');
  matchError(lost, {
    NETWORK_ERROR: () => 'offline',
    BAD_RESPONSE: () => 'bad',
    STREAM_INTERRUPTED: () => 'cut',
    // @ts-expect-error: nothing is left for `unexpected`
    unexpected: () => 'unexpected',
  });
  // @ts-expect-error: STREAM_INTERRUPTED is missing
  matchError(lost, {
    NETWORK_ERROR: () => 'offline',
    BAD_RESPONSE: () => 'bad',
  });
});

test('a defined error with a link code shares its key with the built-in one', () => {
  class Offline extends TrpcError.Tagged('NETWORK_ERROR', {
    data: Schema.Struct({ since: Schema.Number }),
  }) {}
  type E =
    | (TrpcError<'NETWORK_ERROR', { readonly since: number }> & {
        readonly defined: true;
      })
    | BuiltinError;
  const handle = (err: E) =>
    matchError(err, {
      NETWORK_ERROR: (e) => (e.defined ? `since ${e.data.since}` : 'offline'),
      BAD_RESPONSE: (e) => e.code,
      STREAM_INTERRUPTED: (e) => e.code,
      unexpected: (e) => e.code,
    });
  const defined = Object.assign(new Offline({ since: 1 }), {
    defined: true as const,
  });
  expect(handle(defined as E)).toBe('since 1');
  expect(handle(new TrpcError.NetworkError() as E)).toBe('offline');
  expect(handle(new TrpcError.ClientError() as E)).toBe('CLIENT_ERROR');
});
