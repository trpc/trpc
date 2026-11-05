import { describe, expect, it } from 'vitest';

import { drawnSponsors, type Sponsor, sponsors } from '~/sponsors.ts';

import { serveAvatars, svg } from './fake-avatars.ts';
import { fetchCloudAvatars } from './live.ts';
import { renderSponsorCloud } from './render.ts';
import {
  cloudLayout,
  sponsorCloudCacheControl,
  sponsorCloudSource,
  sponsorCloudUrl,
  sponsorCloudWidth,
} from './sponsor-cloud.ts';
import { immutableCacheControl } from './version.ts';

const sponsor = (login: string, weight: number): Sponsor => ({
  createdAt: 0,
  imgSrc: `https://avatars.githubusercontent.com/u/${login}?v=4`,
  link: `https://example.com/${login}`,
  login,
  name: login,
  source: 'github',
  weight,
});

/** A PNG's width, height and color type, from its `IHDR` chunk. */
const pngHeader = (png: Uint8Array) => {
  const view = new DataView(png.buffer, png.byteOffset, png.byteLength);
  return {
    colorType: view.getUint8(25),
    height: view.getUint32(20),
    width: view.getUint32(16),
  };
};

/** RGBA, which keeps the background transparent. */
const rgba = 6;

describe('cloudLayout', () => {
  it("draws every drawn sponsor inside the picture, asking for an avatar at least the circle's size", () => {
    const { bubbles, height } = cloudLayout(sponsors);
    expect(bubbles.map((bubble) => bubble.name).toSorted()).toEqual(
      drawnSponsors.map((drawn) => drawn.name).toSorted(),
    );
    for (const bubble of bubbles) {
      expect(bubble.x - bubble.r).toBeGreaterThanOrEqual(0);
      expect(bubble.y - bubble.r).toBeGreaterThanOrEqual(0);
      expect(bubble.x + bubble.r).toBeLessThanOrEqual(sponsorCloudWidth);
      expect(bubble.y + bubble.r).toBeLessThanOrEqual(height);
      const size = Number(
        new URL(bubble.image).searchParams.get('s') ??
          new URL(bubble.image).searchParams.get('height'),
      );
      expect(size).toBeGreaterThanOrEqual(Math.min(460, bubble.r * 2));
    }
  });

  it('crops the picture to the circles, filling its width', () => {
    const { bubbles, height } = cloudLayout(sponsors);
    const edges = (side: (bubble: (typeof bubbles)[number]) => number) =>
      bubbles.map(side);
    expect(Math.min(...edges((b) => b.x - b.r))).toBeCloseTo(8, 5);
    expect(Math.max(...edges((b) => b.x + b.r))).toBeCloseTo(
      sponsorCloudWidth - 8,
      5,
    );
    expect(Math.min(...edges((b) => b.y - b.r))).toBeCloseTo(8, 5);
    expect(height - Math.max(...edges((b) => b.y + b.r))).toBeLessThan(9);
  });

  it('leaves out the imageless', () => {
    expect(
      cloudLayout([
        sponsor('a', 40),
        { ...sponsor('b', 20), imageless: true },
      ]).bubbles.map((bubble) => bubble.name),
    ).toEqual(['a']);
  });
});

describe('sponsorCloudUrl', () => {
  it('is absolute, with the version in its path', () => {
    expect(sponsorCloudUrl('0123abcdef')).toBe(
      'https://trpc.io/og/0123abcdef/sponsor-cloud.png',
    );
  });
});

describe('sponsorCloudSource', () => {
  it('changes with who it draws, their weight and their avatar, but not the imageless', () => {
    const list = [sponsor('a', 40), sponsor('b', 20)];
    expect(sponsorCloudSource(list)).toBe(
      sponsorCloudSource([...list, { ...sponsor('c', 10), imageless: true }]),
    );
    expect(sponsorCloudSource(list)).not.toBe(
      sponsorCloudSource([sponsor('a', 40), sponsor('b', 21)]),
    );
    expect(sponsorCloudSource(list)).not.toBe(
      sponsorCloudSource([
        sponsor('a', 40),
        { ...sponsor('b', 20), imgSrc: 'https://example.com/b.png' },
      ]),
    );
  });
});

describe('sponsorCloudCacheControl', () => {
  const { bubbles } = cloudLayout([sponsor('a', 40), sponsor('b', 20)]);
  const all = new Map(bubbles.map((bubble) => [bubble.image, 'data:']));

  it('caches it for good when every avatar loaded', () => {
    expect(sponsorCloudCacheControl({ avatars: all, bubbles })).toBe(
      immutableCacheControl,
    );
  });

  it('caches it briefly when an avatar is missing', () => {
    expect(
      sponsorCloudCacheControl({
        avatars: new Map([...all].slice(0, 1)),
        bubbles,
      }),
    ).toBe('public, max-age=0, s-maxage=600');
  });
});

describe('renderSponsorCloud', () => {
  it("draws sponsors.json's sponsors as a transparent PNG of the layout's size, with initials where no avatar loaded", async () => {
    const layout = cloudLayout(sponsors);
    const png = await renderSponsorCloud(layout);
    expect(pngHeader(png)).toEqual({
      colorType: rgba,
      height: layout.height,
      width: sponsorCloudWidth,
    });
  });

  it('draws the avatars that load and initials for the rest', async () => {
    await using server = await serveAvatars({
      '/a.svg': svg(
        '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 4 4"><rect width="4" height="4" fill="#398ccb"/></svg>',
      ),
    });
    const laidOut = cloudLayout([sponsor('a', 40), sponsor('b', 20)]);
    const layout = {
      ...laidOut,
      bubbles: laidOut.bubbles.map((bubble) => ({
        ...bubble,
        image: server.url(`/${bubble.name}.svg`),
      })),
    };
    const avatars = await fetchCloudAvatars(
      layout.bubbles.map((bubble) => bubble.image),
    );
    expect([...avatars.keys()]).toEqual([server.url('/a.svg')]);
    const drawn = await renderSponsorCloud(layout, avatars);
    expect(pngHeader(drawn).width).toBe(sponsorCloudWidth);
    expect(drawn).not.toEqual(await renderSponsorCloud(layout));
  });
});
