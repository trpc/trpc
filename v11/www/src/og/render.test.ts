import { describe, expect, it } from 'vitest';

import type { OgCard } from './card.ts';
import type { Live } from './live.ts';
import { renderOgImage } from './render.ts';

/** A PNG's width and height, from its `IHDR` chunk. */
const pngSize = (png: Uint8Array) => {
  const view = new DataView(png.buffer, png.byteOffset, png.byteLength);
  return { height: view.getUint32(20), width: view.getUint32(16) };
};

const cards: ReadonlyArray<OgCard> = [
  { kind: 'home', path: '/' },
  {
    description: 'Queries, mutations and subscriptions.',
    kind: 'doc',
    path: '/docs/v10/server/procedures',
    title: 'Procedures',
    url: 'https://trpc.io/docs/v10/server/procedures',
  },
  {
    description: '',
    kind: 'doc',
    path: '/docs/client/tanstack-react-query',
    title: 'TanStack React Query (⭐️)',
    url: 'https://trpc.io/docs/client/tanstack-react-query',
  },
  {
    authors: [
      { name: 'Alex / KATT 🐱', title: 'Creator of tRPC' },
      { name: 'Someone' },
    ],
    date: '2025-03-21',
    description: 'Although tRPC v11 has been production-ready…',
    kind: 'post',
    path: '/blog/announcing-trpc-v11',
    readingMinutes: 4,
    title: 'Announcing tRPC v11',
  },
];

/** What the cards show live, as `live.ts` fetches it, but the avatars: initials. */
const live: Live = {
  avatars: new Map(),
  stats: { downloads: 7_926_494, stars: 40_759 },
};

describe('renderOgImage', () => {
  it.each(cards)(
    'renders the $kind card for $path as a 1200×630 PNG',
    async (card) => {
      const png = await renderOgImage(card, live);
      expect([...png.subarray(1, 4)]).toEqual([0x50, 0x4e, 0x47]);
      expect(pngSize(png)).toEqual({ height: 630, width: 1200 });
    },
  );
});

describe('renderOgImage without what it fetches', () => {
  it('renders the home card without its numbers', async () => {
    const png = await renderOgImage({ kind: 'home', path: '/' });
    expect(pngSize(png)).toEqual({ height: 630, width: 1200 });
  });
});
