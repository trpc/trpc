import { describe, expect, it } from 'vitest';

import type { OgCard } from './card.ts';
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
    path: '/v10/docs/server/procedures',
    section: 'Server',
    title: 'Procedures',
    url: 'https://trpc.io/docs/v10/server/procedures',
    version: 'v10',
  },
  {
    description: '',
    kind: 'doc',
    path: '/docs/client/tanstack-react-query',
    section: 'TanStack React Query (⭐️)',
    title: 'Set up the React Query Integration',
    url: 'https://trpc.io/docs/client/tanstack-react-query',
    version: 'v11',
  },
  {
    description: 'Although tRPC v11 has been production-ready…',
    eyebrow: 'March 21, 2025 · tRPC',
    kind: 'post',
    path: '/blog/announcing-trpc-v11',
    title: 'Announcing tRPC v11',
    url: 'https://trpc.io/blog/announcing-trpc-v11',
  },
  {
    description: 'Logos and brand assets.',
    eyebrow: '',
    kind: 'page',
    path: '/media',
    pill: 'MIT licensed',
    title: 'Media',
    url: 'https://trpc.io/media',
  },
  {
    headline: 'Keep tRPC typesafe, fast and free',
    kind: 'sponsor',
    lede: 'MIT licensed, and kept going by 20 sponsors.',
    // One with a drawn logo, and one shown by name.
    partners: [
      { login: 'coderabbitai', name: 'CodeRabbit' },
      { login: 'someone', name: 'Someone' },
    ],
    path: '/sponsor',
    url: 'https://trpc.io/sponsor',
  },
];

describe('renderOgImage', () => {
  it.each(cards)('renders the $kind card for $path as a 1200×630 PNG', async (card) => {
    const png = await renderOgImage(card);
    expect([...png.subarray(1, 4)]).toEqual([0x50, 0x4e, 0x47]);
    expect(pngSize(png)).toEqual({ height: 630, width: 1200 });
  });
});
