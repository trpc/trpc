import { Effect } from 'effect';
import { isValidElement, type ReactNode } from 'react';
import { describe, expect, it } from 'vitest';

import {
  type CardSponsor,
  cardElement,
  drawnAssets,
  drawnBackers,
  initials,
  type OgCard,
  type PostCard,
  type SponsorCard,
} from './card.ts';
import { cardFooterPartners, sponsorCard } from '~/sponsors.ts';

import { serveAvatars, svg, testAvatars } from './fake-avatars.ts';
import { type Live, live } from './live.ts';
import { renderOgImage } from './render.ts';

const liveOf = (card: OgCard, partners: ReadonlyArray<CardSponsor> = []) =>
  Effect.runPromise(live(card, partners).pipe(Effect.provide(testAvatars)));

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
const shown: Live = {
  avatars: new Map(),
  stats: { downloads: 7_926_494, stars: 40_759 },
};

/** `shown`, with every partner's avatar loaded: a blue square. */
const withPartners: Live = {
  ...shown,
  avatars: new Map(
    cardFooterPartners.map((partner) => [
      partner.image,
      `data:image/svg+xml;base64,${Buffer.from(
        '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 4 4"><rect width="4" height="4" fill="#398ccb"/></svg>',
      ).toString('base64')}`,
    ]),
  ),
};

describe('renderOgImage', () => {
  it.each(cards)(
    'renders the $kind card for $path as a 1200×630 PNG',
    async (card) => {
      for (const fetched of [shown, withPartners]) {
        const png = await renderOgImage(card, fetched);
        expect([...png.subarray(1, 4)]).toEqual([0x50, 0x4e, 0x47]);
        expect(pngSize(png)).toEqual({ height: 630, width: 1200 });
      }
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
  const postBy = (image: string): PostCard => ({
    authors: [{ image, name: 'tRPC' }],
    date: '2026-11-01',
    description: '',
    kind: 'post',
    path: '/blog/a',
    readingMinutes: 4,
    title: 'A',
  });

  /** `sponsorCard` with each avatar at `url(index)`. */
  const sponsorCardAt = (url: (path: string) => string): SponsorCard => ({
    ...sponsorCard,
    backers: sponsorCard.backers.map((backer, index) => ({
      ...backer,
      image: url(`/backer-${index}.svg`),
    })),
    partners: sponsorCard.partners.map((partner, index) => ({
      ...partner,
      image: url(`/partner-${index}.svg`),
    })),
  });

  /** Each string `node` draws. */
  const textsOf = (node: ReactNode): ReadonlyArray<string> =>
    typeof node === 'string'
      ? [node]
      : Array.isArray(node)
        ? node.flatMap(textsOf)
        : isValidElement<{ children?: ReactNode }>(node)
          ? textsOf(node.props.children)
          : [];

  const drawn = (
    card: OgCard,
    fetched: Live,
    partners: ReadonlyArray<CardSponsor> = [],
  ) => cardElement({ ...drawnAssets(), wordmark: '' }, card, fetched, partners);

  const unsized = (paths: ReadonlyArray<string>) =>
    Object.fromEntries(paths.map((path) => [path, svg('<svg/>')]));

  it.each(cards.filter((card) => card.kind === 'home' || card.kind === 'doc'))(
    "names the partners along the $kind card's foot for $path",
    (card) => {
      expect(textsOf(drawn(card, withPartners, cardFooterPartners))).toEqual(
        expect.arrayContaining([
          'SUPPORTED BY',
          ...cardFooterPartners.map((partner) => partner.name),
        ]),
      );
    },
  );

  it("draws initials for an author whose SVG satori can't size", async () => {
    await using server = await serveAvatars(unsized(['/unsized.svg']));
    const card = postBy(server.url('/unsized.svg'));
    const fetched = await liveOf(card);
    expect(fetched.avatars.size).toBe(0);
    expect(textsOf(drawn(card, fetched))).toEqual(
      expect.arrayContaining(
        card.authors.map((author) => initials(author.name)),
      ),
    );
    expect(pngSize(await renderOgImage(card, fetched))).toEqual({
      height: 630,
      width: 1200,
    });
  });

  it("draws initials for a partner, and leaves out a small sponsor, whose SVG satori can't size", async () => {
    const paths = [
      ...sponsorCard.partners.map((_, index) => `/partner-${index}.svg`),
      ...sponsorCard.backers.map((_, index) => `/backer-${index}.svg`),
    ];
    await using server = await serveAvatars(unsized(paths));
    const card = sponsorCardAt(server.url);
    const fetched = await liveOf(card);
    expect(fetched.avatars.size).toBe(0);
    const partnerBackers = card.backers.filter(
      (backer) => backer.partner === true,
    );
    expect(drawnBackers(card, fetched)).toEqual(partnerBackers);
    expect(textsOf(drawn(card, fetched))).toEqual(
      expect.arrayContaining(
        [...card.partners, ...partnerBackers].map((sponsor) =>
          initials(sponsor.name),
        ),
      ),
    );
    expect(pngSize(await renderOgImage(card, fetched))).toEqual({
      height: 630,
      width: 1200,
    });
  });

  it("leaves a partner out of a card's foot when their SVG doesn't load", async () => {
    await using server = await serveAvatars({
      '/drawn.svg': svg(
        '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 4 4"><rect width="4" height="4" fill="#398ccb"/></svg>',
      ),
      ...unsized(['/unsized.svg']),
    });
    const partners = [
      { image: server.url('/drawn.svg'), name: 'Drawn' },
      { image: server.url('/unsized.svg'), name: 'Unsized' },
    ];
    const card = postBy(server.url('/unsized.svg'));
    const fetched = await liveOf(card, partners);
    const texts = textsOf(drawn(card, fetched, partners));
    expect(texts).toEqual(expect.arrayContaining(['SUPPORTED BY', 'Drawn']));
    expect(texts).not.toContain('Unsized');
    expect(texts).not.toContain('U');
    expect(textsOf(drawn(card, fetched, partners.slice(1)))).not.toContain(
      'SUPPORTED BY',
    );
    expect(textsOf(drawn(sponsorCard, fetched, partners))).not.toContain(
      'SUPPORTED BY',
    );
    const png = await renderOgImage(card, fetched, partners);
    expect(pngSize(png)).toEqual({ height: 630, width: 1200 });
    // The default partners' avatars aren't in `fetched`, so it has no foot.
    expect(png).not.toEqual(await renderOgImage(card, fetched));
  });

  it('draws an SVG with a viewBox', async () => {
    await using server = await serveAvatars({
      '/logo.svg': svg(
        '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 4 4"><rect width="4" height="4" fill="#398ccb"/></svg>',
      ),
    });
    const card = postBy(server.url('/logo.svg'));
    const fetched = await liveOf(card);
    expect(fetched.avatars.size).toBe(1);
    expect(pngSize(await renderOgImage(card, fetched))).toEqual({
      height: 630,
      width: 1200,
    });
  });
});
