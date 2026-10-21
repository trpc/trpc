/**
 * The runtime checks every option's backend passes: the same errors
 * returned from procedures, failed in Effect code and returned from
 * middleware; a thrown one arriving as `Internal`; tRPC's own failures,
 * the wire, `catchTag` and the v11 handler. The client is the shared one
 * for every option, made from the router's type alone. Each option's test
 * adds its own type assertions.
 */
import { Effect } from 'effect';
import { httpLink, isTrpcError, type AnyLink } from '@trpc12/trpc/client';
import { createV11Handler } from '@trpc12/trpc/interop';
import type { AnyRouter } from '@trpc12/trpc/server';
import { expect, test } from 'vite-plus/test';
import {
  createClient,
  createEffectClient,
  matchError,
  safe,
} from './client.ts';
import { serve } from './serve.ts';

/**
 * The routes each option's app has: `post.byId` returns `PostNotFound`,
 * `post.byIdEffect` fails with it, `post.create` is behind middleware
 * that returns `Unauthorized`, and `post.crash` throws `PostNotFound`.
 */
export interface SuiteApp {
  readonly router: AnyRouter;
}

const clients = (
  links: ReadonlyArray<AnyLink>,
): { readonly client: any; readonly effect: any } => ({
  client: createClient({ links }),
  effect: createEffectClient({ links }),
});

const failingLink = (
  fetch: (url: string, init: RequestInit) => Promise<Response>,
) => httpLink({ url: 'http://localhost/trpc', fetch });

export function registrySuite(name: string, app: SuiteApp) {
  const setup = () => {
    const server = serve(app.router);
    return { ...server, ...clients([server.link]) };
  };

  test(`${name}: a returned error arrives with its status, tag and data`, async () => {
    const s = setup();
    const [, err] = await safe(s.client.post.byId.query({ id: 'nope' }));
    // The client knows no registry: what arrives is v12's own error.
    expect(isTrpcError(err)).toBe(true);
    expect(err).toMatchObject({ _tag: 'PostNotFound', data: { id: 'nope' } });
    expect(s.requests[0]).toEqual({
      status: 404,
      body: {
        json: {
          error: {
            code: 'PostNotFound',
            message: 'PostNotFound',
            data: { id: 'nope' },
            defined: true,
          },
        },
      },
    });
  });

  test(`${name}: an Effect resolver's failure arrives the same way`, async () => {
    const s = setup();
    const [, err] = await safe(s.client.post.byIdEffect.query({ id: 'nope' }));
    expect(err).toMatchObject({ _tag: 'PostNotFound', data: { id: 'nope' } });
    expect(s.requests[0]?.status).toBe(404);
  });

  test(`${name}: middleware returns from the registry too`, async () => {
    const s = setup();
    const [, err] = await safe(s.client.post.create.mutate({ title: 'Hello' }));
    expect(err).toMatchObject({ _tag: 'Unauthorized' });
    expect(s.requests[0]?.status).toBe(401);
  });

  test(`${name}: a thrown error is Internal, as a crash is`, async () => {
    const s = setup();
    const [, err] = await safe(s.client.post.crash.query({ id: 'nope' }));
    expect(err).toMatchObject({ _tag: 'Internal' });
  });

  test(`${name}: tRPC's own failures have their tags`, async () => {
    const s = setup();
    const [, invalid] = await safe(s.client.post.byId.query({ id: 1 }));
    expect(invalid).toMatchObject({ _tag: 'InvalidInput' });
    expect(
      (invalid as { data: { issues: unknown[] } }).data.issues,
    ).not.toEqual([]);
    const [, missing] = await safe(s.client.post.missing.query());
    expect(missing).toMatchObject({ _tag: 'ProcedureNotFound' });

    const offline = clients([
      failingLink(() => Promise.reject(new TypeError('fetch failed'))),
    ]);
    const [, network] = await safe(offline.client.post.byId.query({ id: '1' }));
    expect(network).toMatchObject({ _tag: 'NetworkError' });

    const proxied = clients([
      failingLink(async () => new Response('Bad gateway', { status: 502 })),
    ]);
    const [, proxy] = await safe(proxied.client.post.byId.query({ id: '1' }));
    expect(proxy).toMatchObject({
      _tag: 'UnexpectedStatus',
      data: { status: 502 },
    });

    const hanging = clients([
      failingLink(
        (_, init) =>
          new Promise((_resolve, reject) =>
            init.signal?.addEventListener('abort', () =>
              reject(init.signal?.reason),
            ),
          ),
      ),
    ]);
    const [, timeout] = await safe(
      hanging.client.post.byId.query(
        { id: '1' },
        { signal: AbortSignal.timeout(5) },
      ),
    );
    expect(timeout).toMatchObject({ _tag: 'Timeout' });
  });

  test(`${name}: matchError() picks the handler by tag`, async () => {
    const s = setup();
    const [, err] = await safe(s.client.post.byId.query({ id: 'nope' }));
    const handled = matchError(
      err as { _tag: 'PostNotFound' },
      {
        PostNotFound: () => 'missing',
      } as never,
    );
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
