import { NodeServices } from '@effect/platform-node';
import { describe, expect, it } from '@effect/vitest';
import { Effect } from 'effect';

import { ogImagePath } from '../src/seo.ts';
import { displayUrl, makeOgRenderer, OgCard, plainText } from './og-image.ts';

/** A PNG's width and height, from its `IHDR` chunk. */
const pngSize = (png: Uint8Array) => {
  const view = new DataView(png.buffer, png.byteOffset, png.byteLength);
  return { height: view.getUint32(20), width: view.getUint32(16) };
};

describe('ogImagePath', () => {
  it('mirrors the page path under /og', () => {
    expect(ogImagePath('/')).toBe('/og/index.png');
    expect(ogImagePath('/docs/v10/client/links')).toBe(
      '/og/docs/v10/client/links.png',
    );
    expect(ogImagePath('/docs/quickstart')).toBe('/og/docs/quickstart.png');
  });
});

describe('plainText', () => {
  it('drops emoji, which the fonts lack, and the parentheses around them', () => {
    expect(plainText('TanStack React Query (⭐️)')).toBe('TanStack React Query');
    expect(plainText('Next.js Integration › App Router')).toBe(
      'Next.js Integration › App Router',
    );
  });

  it("drops the backticks around code, and keeps a call's parentheses", () => {
    expect(
      plainText('Packages that extend every procedure with `t.concat()`'),
    ).toBe('Packages that extend every procedure with t.concat()');
  });
});

describe('displayUrl', () => {
  it('splits the host from the path', () => {
    expect(displayUrl('https://trpc.io/docs/server/procedures')).toEqual({
      host: 'trpc.io',
      path: '/docs/server/procedures',
    });
    expect(displayUrl('https://trpc.io')).toEqual({
      host: 'trpc.io',
      path: '',
    });
  });
});

describe('makeOgRenderer', () => {
  it.effect('renders each kind of card as a 1200×630 PNG', () =>
    Effect.gen(function* () {
      const render = yield* makeOgRenderer();
      const cards = [
        OgCard.Home({ path: '/' }),
        OgCard.Doc({
          description: 'Queries, mutations and subscriptions.',
          path: '/docs/v10/server/procedures',
          section: 'Server',
          title: 'Procedures',
          url: 'https://trpc.io/docs/v10/server/procedures',
          version: 'v10',
        }),
        OgCard.Doc({
          description: '',
          path: '/docs/client/tanstack-react-query',
          section: 'TanStack React Query (⭐️)',
          title: 'Set up the React Query Integration',
          url: 'https://trpc.io/docs/client/tanstack-react-query',
          version: 'v11',
        }),
        OgCard.Post({
          description: 'Although tRPC v11 has been production-ready…',
          eyebrow: 'March 21, 2025 · tRPC',
          path: '/blog/announcing-trpc-v11',
          title: 'Announcing tRPC v11',
          url: 'https://trpc.io/blog/announcing-trpc-v11',
        }),
        OgCard.Sponsor({
          headline: 'Keep tRPC typesafe, fast and free',
          lede: 'MIT licensed, and kept going by 20 sponsors.',
          // One with a drawn logo, and one shown by name.
          partners: [
            { login: 'coderabbitai', name: 'CodeRabbit' },
            { login: 'someone', name: 'Someone' },
          ],
          path: '/sponsor',
          url: 'https://trpc.io/sponsor',
        }),
      ];
      for (const card of cards) {
        const png = yield* render(card);
        expect([...png.subarray(1, 4)]).toEqual([0x50, 0x4e, 0x47]);
        expect(pngSize(png)).toEqual({ height: 630, width: 1200 });
      }
    }).pipe(Effect.provide(NodeServices.layer)),
  );
});
