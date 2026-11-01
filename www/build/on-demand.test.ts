import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { pathToFileURL } from 'node:url';
import { NodeServices } from '@effect/platform-node';
import { describe, expect, it } from '@effect/vitest';
import { Effect, FileSystem, Path } from 'effect';

import {
  flagsValue,
  onDemandFunction,
  onDemandRoutes,
  pageCacheControl,
  pathParam,
  writeOnDemandFunction,
} from './on-demand.ts';

describe('flagsValue', () => {
  const value = new RegExp(
    flagsValue(['publisher', 'contracts', 'tanstack-db']),
  );

  it('matches a list of experiments, in any order', () => {
    expect(value.test('publisher')).toBe(true);
    expect(value.test('contracts,publisher')).toBe(true);
    expect(value.test('publisher%2Ccontracts')).toBe(true);
    expect(value.test('tanstack-db%2ctanstack-db')).toBe(true);
  });

  it("doesn't match a name that isn't an experiment", () => {
    expect(value.test('')).toBe(false);
    expect(value.test('nope')).toBe(false);
    expect(value.test('publisher,nope')).toBe(false);
    expect(value.test('publisherx')).toBe(false);
    expect(value.test('tanstack')).toBe(false);
  });
});

describe('onDemandRoutes', () => {
  const all = onDemandRoutes(['publisher']);
  const [flagged] = all;
  const search = all.find((route) => route.src === '^/search$');

  it('sends pages with ?flags= to the function, with their path', () => {
    const src = new RegExp(flagged?.src ?? '');
    expect(src.exec('/docs/server/routers')?.[1]).toBe('/docs/server/routers');
    expect(src.test('/')).toBe(true);
    expect(src.test('/assets/app.js')).toBe(false);
    expect(src.test('/llms.txt')).toBe(false);
    expect(flagged?.dest).toBe(`/${onDemandFunction}?${pathParam}=$1`);
    expect(flagged?.has).toEqual([
      { key: 'flags', type: 'query', value: flagsValue(['publisher']) },
    ]);
  });

  it('sends nothing with ?flags= without experiments', () => {
    expect(
      onDemandRoutes([]).some((route) =>
        JSON.stringify(route.has ?? []).includes('"flags"'),
      ),
    ).toBe(false);
  });

  it('sends the social cards to the function, with their path', () => {
    const og = all.find((route) => route.src?.startsWith('^(/og/'));
    const src = new RegExp(og?.src ?? '');
    expect(src.exec('/og/docs/client/links.png')?.[1]).toBe(
      '/og/docs/client/links.png',
    );
    expect(src.test('/og/index.png')).toBe(true);
    expect(src.test('/og/')).toBe(false);
    expect(src.test('/docs/og/a.png')).toBe(false);
    expect(og?.dest).toBe(`/${onDemandFunction}?${pathParam}=$1`);
    expect(og?.has).toBeUndefined();
  });

  it('sends a search to the function', () => {
    expect(search?.dest).toBe(`/${onDemandFunction}?${pathParam}=/search`);
    expect(search?.has).toEqual([{ key: 'q', type: 'query', value: '^.+$' }]);
  });
});

describe('writeOnDemandFunction', () => {
  it.effect('renders the requested path with the server build', () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const path = yield* Path.Path;
      const root = yield* fs.makeTempDirectoryScoped({ prefix: 'on-demand-' });
      yield* fs.makeDirectory(path.join(root, 'dist/server'), {
        recursive: true,
      });
      yield* fs.writeFileString(
        path.join(root, 'dist/server/server.js'),
        [
          'export default {',
          '  fetch: (request) =>',
          '    new Response(`${request.method} ${request.url} ${request.headers.get("accept")}`, {',
          '      headers: [["content-type", "text/html"], ["set-cookie", "a=1"], ["set-cookie", "b=2"]],',
          '    }),',
          '};',
          '',
        ].join('\n'),
      );
      const output = path.join(root, '.vercel/output');
      yield* writeOnDemandFunction(root, output);
      const dir = path.join(output, `functions/${onDemandFunction}.func`);
      expect(
        JSON.parse(yield* fs.readFileString(path.join(dir, '.vc-config.json'))),
      ).toMatchObject({ handler: 'index.mjs', launcherType: 'Nodejs' });

      const entry = yield* Effect.promise(
        () => import(pathToFileURL(path.join(dir, 'index.mjs')).href),
      );
      const server = createServer(entry.default);
      yield* Effect.acquireRelease(
        Effect.promise(
          () => new Promise<void>((resolve) => server.listen(0, resolve)),
        ),
        () => Effect.sync(() => server.close()),
      );
      const { port } = server.address() as AddressInfo;
      const fetchText = (url: string, init?: RequestInit) =>
        Effect.promise(async () => {
          const response = await fetch(`http://localhost:${port}${url}`, init);
          return { body: await response.text(), response };
        });

      const rewritten = yield* fetchText(
        `/${onDemandFunction}?${pathParam}=/v12/docs/a&flags=publisher`,
        { headers: { accept: 'text/html' } },
      );
      expect(rewritten.body).toBe(
        `GET https://localhost:${port}/v12/docs/a?flags=publisher text/html`,
      );
      expect(rewritten.response.headers.get('cache-control')).toBe(
        pageCacheControl,
      );
      expect(rewritten.response.headers.getSetCookie()).toEqual(['a=1', 'b=2']);

      // Should the host pass the original URL instead, it's rendered as is.
      const original = yield* fetchText('/v12/docs/b?flags=publisher');
      expect(original.body).toContain(
        `localhost:${port}/v12/docs/b?flags=publisher`,
      );

      const head = yield* fetchText('/', { method: 'HEAD' });
      expect(head.response.status).toBe(200);
      expect(head.body).toBe('');
    }).pipe(Effect.scoped, Effect.provide(NodeServices.layer)),
  );
});
