import { isValidElement, type ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { cardElement, drawnAssets, initials, type OgCard } from './card.ts';
import { sponsorCard } from '~/sponsors.ts';

import { fetchLive, type Live } from './live.ts';
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
  {
    authors: [
      {
        image: 'https://github.com/KATT.png',
        name: 'Alex / KATT 🐱',
        title: 'Creator of tRPC',
      },
      {
        image: 'https://github.com/claude.png',
        name: 'Claude',
        title: 'Opus 5.5',
      },
    ],
    date: '2026-11-01',
    description:
      'New in the TanStack React Query integration: a loader starts a query and passes it down, and the component reads it without repeating its input.',
    kind: 'post',
    path: '/blog/query-handles',
    readingMinutes: 6,
    title: 'Query handles: pass the query, not the input',
  },
  {
    description: '',
    kind: 'doc',
    path: '/docs/typedoc/server/index/interfaces/TRPCProcedureBuilder',
    title:
      'Interface: TRPCProcedureBuilder<TContext, TMeta, TContextOverrides, TInputIn, TInputOut, TOutputIn, TOutputOut, TCaller, TErrorShape>',
    url: 'https://trpc.io/docs/typedoc/server/index/interfaces/TRPCProcedureBuilder',
  },
  sponsorCard,
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

describe('renderOgImage with SVG avatars', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  const postBy = (image: string): OgCard => ({
    authors: [{ image, name: 'tRPC' }],
    date: '2026-11-01',
    description: '',
    kind: 'post',
    path: '/blog/a',
    readingMinutes: 4,
    title: 'A',
  });

  const serve = (svg: string) =>
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async () =>
          new Response(svg, { headers: { 'content-type': 'image/svg+xml' } }),
      ),
    );

  /** Each string `node` draws. */
  const textsOf = (node: ReactNode): ReadonlyArray<string> =>
    typeof node === 'string'
      ? [node]
      : Array.isArray(node)
        ? node.flatMap(textsOf)
        : isValidElement<{ children?: ReactNode }>(node)
          ? textsOf(node.props.children)
          : [];

  const namesOn = (card: OgCard) =>
    card.kind === 'post'
      ? card.authors.map((author) => author.name)
      : card.kind === 'sponsor'
        ? [...card.partners, ...card.backers].map((sponsor) => sponsor.name)
        : [];

  it.each([postBy('https://example.com/unsized.svg'), sponsorCard])(
    "draws initials on the $kind card for an SVG satori can't size",
    async (card) => {
      serve('<svg/>');
      const fetched = await fetchLive(card);
      expect(fetched.avatars.size).toBe(0);
      const texts = textsOf(
        cardElement({ ...drawnAssets(), wordmark: '' }, card, fetched),
      );
      for (const name of namesOn(card)) {
        expect(texts).toContain(initials(name));
      }
      expect(pngSize(await renderOgImage(card, fetched))).toEqual({
        height: 630,
        width: 1200,
      });
    },
  );

  it('draws an SVG with a viewBox', async () => {
    serve(
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 4 4"><rect width="4" height="4" fill="#398ccb"/></svg>',
    );
    const card = postBy('https://example.com/logo.svg');
    const fetched = await fetchLive(card);
    expect(fetched.avatars.size).toBe(1);
    expect(pngSize(await renderOgImage(card, fetched))).toEqual({
      height: 630,
      width: 1200,
    });
  });
});
