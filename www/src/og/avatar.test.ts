import { Effect, Result } from 'effect';
import { describe, expect, it } from 'vitest';

import {
  AvatarRequestError,
  Avatars,
  AvatarSizeError,
  AvatarStatusError,
  AvatarTimeoutError,
  AvatarTypeError,
  avatarUrl,
  fetchAvatars,
  sizableSvg,
} from './avatar.ts';
import { png, serveAvatars, svg, testAvatars } from './fake-avatars.ts';

const fetchOne = (url: string) =>
  Effect.runPromise(
    Effect.gen(function* () {
      const avatars = yield* Avatars;
      return yield* Effect.result(avatars.fetch(url));
    }).pipe(Effect.provide(testAvatars)),
  );

const failureOf = async (url: string) => {
  const result = await fetchOne(url);
  return Result.isFailure(result) ? result.failure : undefined;
};

describe('avatarUrl', () => {
  it("asks GitHub and Open Collective for 128 pixels, and leaves other hosts' URLs alone", () => {
    expect(avatarUrl('https://github.com/KATT.png')).toBe(
      'https://github.com/KATT.png?size=128',
    );
    expect(
      avatarUrl('https://avatars.githubusercontent.com/u/459267?v=4'),
    ).toBe('https://avatars.githubusercontent.com/u/459267?v=4&size=128');
    expect(
      avatarUrl('https://images.opencollective.com/hooli/1a2b3c4/logo.png'),
    ).toBe(
      'https://images.opencollective.com/hooli/1a2b3c4/logo.png?height=128',
    );
    expect(avatarUrl('https://evilgithubusercontent.com/a.png')).toBe(
      'https://evilgithubusercontent.com/a.png',
    );
  });
});

describe('sizableSvg', () => {
  it.each([
    ['<svg viewBox="0 0 24 24"/>', true],
    ["<svg viewBox='0,0,24,24'/>", true],
    ['<svg width="24" height="24px"/>', true],
    ['<?xml version="1.0"?>\n<SVG viewBox="0 0 1 1"></SVG>', true],
    ['<svg/>', false],
    ['<svg width="24"/>', false],
    ['<svg width="100%" height="100%"/>', false],
    ['<svg viewBox="0 0 0 24"/>', false],
    ['<svg width="0" height="24"/>', false],
    ['<svg width="0" height="24" viewBox="0 0 24 24"/>', false],
    ['<svg width="24" viewBox="0 0 24 12"/>', true],
    ['<svg height="24" viewBox="0 0 0 24"/>', false],
    ['<svg width="24" viewBox="nope"/>', false],
    ['<svg viewBox="nope"/>', false],
    ['<html>not an svg</html>', false],
  ])('sizes %s: %s', (text, sizable) => {
    expect(sizableSvg(text)).toBe(sizable);
  });
});

describe('Avatars', () => {
  it('gives a PNG or a sized SVG as a data URI', async () => {
    const logo = '<svg viewBox="0 0 4 4"/>';
    await using server = await serveAvatars({
      '/a.png': png(),
      '/logo.svg': svg(logo),
    });
    expect(await fetchOne(server.url('/a.png'))).toEqual(
      Result.succeed('data:image/png;base64,AQID'),
    );
    expect(await fetchOne(server.url('/logo.svg'))).toEqual(
      Result.succeed(
        `data:image/svg+xml;base64,${Buffer.from(logo).toString('base64')}`,
      ),
    );
  });

  it("fails at once on a 404, a type satori can't draw or an unsized SVG", async () => {
    await using server = await serveAvatars({
      '/page.html': { body: '<html/>', type: 'text/html' },
      '/unsized.svg': svg('<svg/>'),
    });
    expect(await failureOf(server.url('/gone.png'))).toBeInstanceOf(
      AvatarStatusError,
    );
    expect(await failureOf(server.url('/page.html'))).toEqual(
      new AvatarTypeError({
        contentType: 'text/html',
        url: server.url('/page.html'),
      }),
    );
    expect(await failureOf(server.url('/unsized.svg'))).toBeInstanceOf(
      AvatarSizeError,
    );
    expect(server.hits).toEqual(['/gone.png', '/page.html', '/unsized.svg']);
  });

  it('tries again after a 5xx, twice at most', async () => {
    await using server = await serveAvatars({
      '/down.png': { status: 503 },
      '/flaky.png': [{ status: 502 }, png()],
    });
    expect(Result.isSuccess(await fetchOne(server.url('/flaky.png')))).toBe(
      true,
    );
    expect(await failureOf(server.url('/down.png'))).toEqual(
      new AvatarStatusError({ status: 503, url: server.url('/down.png') }),
    );
    expect(server.hits).toEqual([
      '/flaky.png',
      '/flaky.png',
      '/down.png',
      '/down.png',
      '/down.png',
    ]);
  });

  it('gives up on a try that takes too long, and tries again', async () => {
    await using server = await serveAvatars({
      '/slow.png': ['hang', png()],
      '/stuck.png': 'hang',
    });
    expect(Result.isSuccess(await fetchOne(server.url('/slow.png')))).toBe(
      true,
    );
    expect(await failureOf(server.url('/stuck.png'))).toEqual(
      new AvatarTimeoutError({ url: server.url('/stuck.png') }),
    );
    expect(server.hits.filter((hit) => hit === '/stuck.png')).toHaveLength(3);
  });

  it('fails without a response when nothing listens', async () => {
    const server = await serveAvatars({});
    const url = server.url('/a.png');
    await server.close();
    expect(await failureOf(url)).toBeInstanceOf(AvatarRequestError);
  });
});

describe('fetchAvatars', () => {
  it('gives the avatars that loaded, each fetched once, eight at a time', async () => {
    const routes = Object.fromEntries(
      Array.from({ length: 20 }, (_, index) => [
        `/${index}.png`,
        { ...png([index]), delay: 20 },
      ]),
    );
    await using server = await serveAvatars(routes);
    const images = [
      ...Object.keys(routes).map(server.url),
      server.url('/0.png'),
      server.url('/gone.png'),
    ];
    const loaded = await Effect.runPromise(
      fetchAvatars(images).pipe(Effect.provide(testAvatars)),
    );
    expect([...loaded.keys()]).toEqual(Object.keys(routes).map(server.url));
    expect(server.hits.filter((hit) => hit === '/0.png')).toHaveLength(1);
    expect(server.mostInFlight).toBeLessThanOrEqual(8);
    expect(server.mostInFlight).toBeGreaterThan(1);
  });
});
