/**
 * The runtime checks every option's backend passes: the same four errors
 * thrown from procedures, Effect code and middleware, tRPC's own failures,
 * the wire, `catchTag` and the v11 handler. Each option's test adds its
 * own type assertions.
 */
import { Effect } from 'effect';
import { httpLink, type AnyLink } from '@trpc12/trpc/client';
import { createV11Handler } from '@trpc12/trpc/interop';
import type { AnyRouter } from '@trpc12/trpc/server';
import { expect, test } from 'vite-plus/test';
import { matchError, safe, serve } from './client.ts';
import { trpcFailures } from './framework.ts';

export interface SuiteApp {
  readonly router: AnyRouter;
  /** The app's error classes by tag, for `instanceof`. */
  readonly classes: Readonly<Record<string, abstract new (...args: any) => unknown>>;
  /** A Promise client and an Effect client over `links`. */
  readonly clients: (links: ReadonlyArray<AnyLink>) => {
    readonly client: any;
    readonly effect: any;
  };
  /** The id a `PostNotFound` names, however the option stores `data`. */
  readonly missingId: (err: any) => string;
}

const failingLink = (fetch: (url: string, init: RequestInit) => Promise<Response>) =>
  httpLink({ url: 'http://localhost/trpc', fetch });

export function registrySuite(name: string, app: SuiteApp) {
  const setup = () => {
    const server = serve(app.router);
    return { ...server, ...app.clients([server.link]) };
  };

  test(`${name}: a procedure's thrown error has its status, tag and data`, async () => {
    const s = setup();
    const [, err] = await safe(s.client.post.byId.query({ id: 'nope' }));
    expect(err).toBeInstanceOf(app.classes['PostNotFound']!);
    expect(app.missingId(err)).toBe('nope');
    expect(s.requests[0]).toEqual({
      status: 404,
      body: {
        json: {
          error: {
            code: 'PostNotFound',
            message: 'PostNotFound',
            data: { id: 'nope' },
            defined: false,
          },
        },
      },
    });
  });

  test(`${name}: an Effect resolver's failure arrives the same way`, async () => {
    const s = setup();
    const [, err] = await safe(s.client.post.byIdEffect.query({ id: 'nope' }));
    expect(err).toBeInstanceOf(app.classes['PostNotFound']!);
    expect(s.requests[0]?.status).toBe(404);
  });

  test(`${name}: middleware throws from the registry too`, async () => {
    const s = setup();
    const [, err] = await safe(s.client.post.create.mutate({ title: 'Hello' }));
    expect(err).toBeInstanceOf(app.classes['Unauthorized']!);
    expect(s.requests[0]?.status).toBe(401);
  });

  test(`${name}: tRPC's own failures are registry errors`, async () => {
    const s = setup();
    const [, invalid] = await safe(s.client.post.byId.query({ id: 1 }));
    expect(invalid).toBeInstanceOf(trpcFailures.InvalidInput);
    expect((invalid as { data: { issues: unknown[] } }).data.issues).not.toEqual([]);
    const [, missing] = await safe(s.client.post.missing.query());
    expect(missing).toBeInstanceOf(trpcFailures.ProcedureNotFound);

    const offline = app.clients([
      failingLink(() => Promise.reject(new TypeError('fetch failed'))),
    ]);
    const [, network] = await safe(offline.client.post.byId.query({ id: '1' }));
    expect(network).toBeInstanceOf(trpcFailures.NetworkError);

    const proxied = app.clients([
      failingLink(async () => new Response('Bad gateway', { status: 502 })),
    ]);
    const [, proxy] = await safe(proxied.client.post.byId.query({ id: '1' }));
    expect(proxy).toBeInstanceOf(trpcFailures.UnexpectedStatus);
    expect((proxy as { data: { status: number } }).data).toEqual({ status: 502 });

    const hanging = app.clients([
      failingLink(
        (_, init) =>
          new Promise((_resolve, reject) =>
            init.signal?.addEventListener('abort', () => reject(init.signal?.reason)),
          ),
      ),
    ]);
    const [, timeout] = await safe(
      hanging.client.post.byId.query({ id: '1' }, { signal: AbortSignal.timeout(5) }),
    );
    expect(timeout).toBeInstanceOf(trpcFailures.Timeout);
  });

  test(`${name}: matchError() picks the handler by tag`, async () => {
    const s = setup();
    const [, err] = await safe(s.client.post.byId.query({ id: 'nope' }));
    const handled = matchError(err as { _tag: 'PostNotFound' }, {
      PostNotFound: () => 'missing',
    } as never);
    expect(handled).toBe('missing');
  });

  test(`${name}: Effect.catchTag takes one error out`, async () => {
    const s = setup();
    const result = await Effect.runPromise(
      (
        s.effect.post.byId.query({ id: 'nope' }) as Effect.Effect<
          unknown,
          { readonly _tag: 'PostNotFound' }
        >
      ).pipe(Effect.catchTag('PostNotFound', () => Effect.succeed('caught'))),
    );
    expect(result).toBe('caught');
  });

  test(`${name}: a v11 client gets the v11 code for the error's status`, async () => {
    const v11 = createV11Handler({
      router: app.router,
      createContext: () => ({ user: null }),
    });
    const input = encodeURIComponent(JSON.stringify({ id: 'nope' }));
    const res = await v11.fetch(
      new Request(`http://localhost/trpc/post.byId?input=${input}`),
    );
    expect(res.status).toBe(404);
    expect(await res.json()).toMatchObject({
      error: {
        code: -32004,
        message: 'PostNotFound',
        data: { code: 'NOT_FOUND', httpStatus: 404, path: 'post.byId' },
      },
    });
  });
}
