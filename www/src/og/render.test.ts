import { inflateSync } from 'node:zlib';

import { Effect } from 'effect';
import { isValidElement, type ReactNode } from 'react';
import { describe, expect, it } from 'vitest';

import {
  type CardFooter,
  cardElement,
  drawnAssets,
  drawnBackers,
  initials,
  type OgCard,
  type PostCard,
  partnerName,
  type SponsorCard,
} from './card.ts';
import { cardFooter, sponsorCard } from '~/sponsors.ts';

import { footerWith, serveAvatars, svg, testAvatars } from './fake-avatars.ts';
import { type Live, live } from './live.ts';
import { renderOgImage } from './render.ts';

const liveOf = (card: OgCard, footer: CardFooter = footerWith()) =>
  Effect.runPromise(live(card, footer).pipe(Effect.provide(testAvatars)));

/** A PNG's width and height, from its `IHDR` chunk. */
const pngSize = (png: Uint8Array) => {
  const view = new DataView(png.buffer, png.byteOffset, png.byteLength);
  return { height: view.getUint32(20), width: view.getUint32(16) };
};

const paeth = (a: number, b: number, c: number) => {
  const p = a + b - c;
  const [pa, pb, pc] = [Math.abs(p - a), Math.abs(p - b), Math.abs(p - c)];
  return pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
};

/** A PNG's rows of RGBA bytes, as resvg writes it: 8-bit RGBA, not interlaced. */
const pngRows = (png: Uint8Array) => {
  const view = new DataView(png.buffer, png.byteOffset, png.byteLength);
  expect([png[24], png[25], png[28]]).toEqual([8, 6, 0]);
  const { height, width } = pngSize(png);
  const chunks: Array<Uint8Array> = [];
  for (let at = 8; at < png.length; at += 12 + view.getUint32(at)) {
    if (String.fromCharCode(...png.subarray(at + 4, at + 8)) === 'IDAT') {
      chunks.push(png.subarray(at + 8, at + 8 + view.getUint32(at)));
    }
  }
  const data = inflateSync(Buffer.concat(chunks));
  const stride = width * 4;
  const rows: Array<Uint8Array> = [];
  let above = new Uint8Array(stride);
  for (let y = 0; y < height; y++) {
    const start = y * (stride + 1);
    const filter = data[start];
    const row = data.slice(start + 1, start + 1 + stride);
    for (let x = 0; x < stride; x++) {
      const a = x < 4 ? 0 : (row[x - 4] ?? 0);
      const b = above[x] ?? 0;
      const c = x < 4 ? 0 : (above[x - 4] ?? 0);
      const predicted = [0, a, b, (a + b) >> 1, paeth(a, b, c)][filter ?? 0];
      row[x] = ((row[x] ?? 0) + (predicted ?? 0)) & 0xff;
    }
    rows.push(row);
    above = row;
  }
  return rows;
};

/**
 * How many of `rows`' pixels are darker than the card's background, its
 * glow and its dot grid: text, avatars, rules.
 */
const inked = (rows: ReadonlyArray<Uint8Array>) =>
  rows.reduce((sum, row) => {
    let count = 0;
    for (let x = 0; x < row.length; x += 4) {
      if (Math.min(row[x] ?? 0, row[x + 1] ?? 0, row[x + 2] ?? 0) < 200) {
        count += 1;
      }
    }
    return sum + count;
  }, 0);

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
    description:
      'A description long enough that the card cuts it at one hundred and thirty characters, the most a docs page card draws of one, here.',
    kind: 'doc',
    path: '/docs/client/tanstack-react-query/server-components',
    title: 'Set up with React Server Components and the App Router in Next',
    url: 'https://trpc.io/docs/client/tanstack-react-query/server-components',
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

/** `shown`, with the avatar of every sponsor along the foot loaded: a blue square. */
const withSponsors: Live = {
  ...shown,
  avatars: new Map(
    [...cardFooter.partners, ...cardFooter.backers].map((sponsor) => [
      sponsor.image,
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
      for (const fetched of [shown, withSponsors]) {
        const png = await renderOgImage(card, fetched);
        expect([...png.subarray(1, 4)]).toEqual([0x50, 0x4e, 0x47]);
        expect(pngSize(png)).toEqual({ height: 630, width: 1200 });
      }
    },
  );
});

describe('renderOgImage under a caption', () => {
  it.each(cards)(
    'draws nothing in the bottom fifth of the $kind card for $path but the background and the rule',
    async (card) => {
      const rows = pngRows(await renderOgImage(card, withSponsors));
      // From 80% of 630px down to the brand rule along the bottom edge.
      const band = rows.slice(504, 620);
      expect(band).toHaveLength(116);
      expect(inked(band)).toBe(0);
      expect(inked(rows.slice(0, 504))).toBeGreaterThan(0);
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
    footer: CardFooter = footerWith(),
  ) => cardElement({ ...drawnAssets(), wordmark: '' }, card, fetched, footer);

  const unsized = (paths: ReadonlyArray<string>) =>
    Object.fromEntries(paths.map((path) => [path, svg('<svg/>')]));

  it.each(cards.filter((card) => card.kind === 'home' || card.kind === 'doc'))(
    "names the partners along the $kind card's foot for $path",
    (card) => {
      expect(textsOf(drawn(card, withSponsors, cardFooter))).toEqual(
        expect.arrayContaining([
          'SUPPORTED BY',
          ...cardFooter.partners.map((partner) => partnerName(partner.name)),
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
    const fetched = await liveOf(card, footerWith(partners));
    const texts = textsOf(drawn(card, fetched, footerWith(partners)));
    expect(texts).toEqual(expect.arrayContaining(['SUPPORTED BY', 'Drawn']));
    expect(texts).not.toContain('Unsized');
    expect(texts).not.toContain('U');
    expect(
      textsOf(drawn(card, fetched, footerWith(partners.slice(1)))),
    ).not.toContain('SUPPORTED BY');
    expect(
      textsOf(drawn(sponsorCard, fetched, footerWith(partners))),
    ).not.toContain('SUPPORTED BY');
    const png = await renderOgImage(card, fetched, footerWith(partners));
    expect(pngSize(png)).toEqual({ height: 630, width: 1200 });
    // The default footer's avatars aren't in `fetched`, so it has no foot.
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

  it("draws every partner's name along a card's foot, a long one cut short, with the other sponsors' faces", async () => {
    const square = svg(
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 4 4"><rect width="4" height="4" fill="#398ccb"/></svg>',
    );
    const names = [
      'CodeRabbit',
      'Greptile',
      'SerpApi',
      'Some Company Name GmbH & Co. KG',
      'Wonderfully Long Partner Name',
    ];
    await using server = await serveAvatars({
      ...Object.fromEntries(
        names.map((_, index) => [`/p${index}.svg`, square]),
      ),
      '/face.svg': square,
    });
    const footer = footerWith(
      names.map((name, index) => ({
        image: server.url(`/p${index}.svg`),
        name,
      })),
      [{ image: server.url('/face.svg'), name: 'Face' }],
    );
    const card = postBy(server.url('/p0.svg'));
    const fetched = await liveOf(card, footer);
    const texts = textsOf(drawn(card, fetched, footer));
    expect(texts).toEqual(
      expect.arrayContaining([
        'CodeRabbit',
        'Greptile',
        'SerpApi',
        'Some Company N…',
        'Wonderfully Long…',
      ]),
    );
    expect(texts).not.toContain('Some Company Name GmbH & Co. KG');
    expect(pngSize(await renderOgImage(card, fetched, footer))).toEqual({
      height: 630,
      width: 1200,
    });
  });
});
