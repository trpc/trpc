/**
 * `/sponsor`'s cloud of sponsors as a PNG, for the READMEs
 * (`build/sponsors-readme.ts`): each sponsor a circle of their avatar,
 * packed as the page packs them (`components/sponsors/pack.ts`), on a
 * transparent background. `routes/og.$.ts` serves it at `sponsorCloudPath`,
 * with the avatars fetched on request (`live.ts`); `render.ts` draws it.
 *
 * The build scripts import this with Node, so it imports nothing through
 * `~/`.
 */
import { cloudPadding, packSponsors } from '../components/sponsors/pack.ts';
import { site } from '../site.ts';
import { avatarUrl, type Sponsor, sponsorKey } from '../sponsors.ts';

export const sponsorCloudPath = '/og/sponsor-cloud.png';

/** The PNG's width in pixels: twice the width the READMEs show it at. */
export const sponsorCloudWidth = 1200;

/** The width the READMEs show it at, in CSS pixels. */
export const sponsorCloudDisplayWidth = sponsorCloudWidth / 2;

/** Room around the cloud for the circles' rings, in pixels. */
const margin = 8;

/** GitHub resizes avatars; the cloud asks for the smallest of these that's sharp. */
const avatarSizes = [64, 120, 240, 460] as const;

/** A sponsor's circle in the PNG, in pixels. */
export interface CloudBubble {
  /** Their avatar's URL, at the size the circle needs, which `live.ts` fetches. */
  readonly image: string;
  readonly name: string;
  readonly r: number;
  readonly x: number;
  readonly y: number;
}

/** The PNG's circles, and its height: as tall as they need. */
export interface CloudLayout {
  readonly bubbles: ReadonlyArray<CloudBubble>;
  readonly height: number;
}

const drawn = (sponsors: ReadonlyArray<Sponsor>) =>
  sponsors.filter((sponsor) => sponsor.imageless !== true);

/**
 * `sponsors`' circles, but the imageless, in the heart `/sponsor` packs
 * them in, scaled to fill `sponsorCloudWidth` and cropped to them.
 */
export function cloudLayout(sponsors: ReadonlyArray<Sponsor>): CloudLayout {
  const packed = packSponsors(drawn(sponsors), cloudPadding);
  if (packed.length === 0) {
    return { bubbles: [], height: 2 * margin };
  }
  const left = Math.min(...packed.map((bubble) => bubble.x - bubble.r));
  const right = Math.max(...packed.map((bubble) => bubble.x + bubble.r));
  const top = Math.min(...packed.map((bubble) => bubble.y - bubble.r));
  const bottom = Math.max(...packed.map((bubble) => bubble.y + bubble.r));
  const scale = (sponsorCloudWidth - 2 * margin) / (right - left);
  return {
    bubbles: packed.map((bubble) => ({
      image: avatarUrl(
        bubble.sponsor,
        avatarSizes.find((size) => size >= bubble.r * 2 * scale) ?? 460,
      ),
      name: bubble.sponsor.name,
      r: bubble.r * scale,
      x: margin + (bubble.x - left) * scale,
      y: margin + (bubble.y - top) * scale,
    })),
    height: Math.ceil((bottom - top) * scale + 2 * margin),
  };
}

/** 32-bit FNV-1a, as 8 hex digits. */
const fnv1a = (text: string) => {
  let hash = 0x81_1c_9d_c5;
  for (const byte of new TextEncoder().encode(text)) {
    hash = Math.imul(hash ^ byte, 0x01_00_01_93) >>> 0;
  }
  return hash.toString(16).padStart(8, '0');
};

/**
 * What the PNG draws of `sponsors`, as a short hash: it changes when one
 * joins or leaves, or their weight, avatar URL or name does. GitHub keeps
 * an avatar's URL when its picture changes, so a new picture shows once
 * the CDN's copy expires, within a day, as on the social cards.
 */
export const sponsorCloudVersion = (sponsors: ReadonlyArray<Sponsor>) =>
  fnv1a(
    drawn(sponsors)
      .map(
        (sponsor) =>
          `${sponsorKey(sponsor)} ${sponsor.weight} ${sponsor.imgSrc} ${sponsor.name}`,
      )
      .join('\n'),
  );

/**
 * Where the READMEs show the PNG of `sponsors`: absolute, so it draws on
 * npm, and with `?v=` their version, so GitHub's image proxy fetches it
 * again when the sponsors change rather than keep the last one.
 */
export const sponsorCloudUrl = (sponsors: ReadonlyArray<Sponsor>) =>
  `${site.url}${sponsorCloudPath}?v=${sponsorCloudVersion(sponsors)}`;

/**
 * How long the CDN keeps the PNG: ten minutes when an avatar it draws
 * didn't load, and as a page otherwise (`undefined`). A README asking for
 * another version (one from just before a deploy, or a package's on npm
 * from an older one) is redirected to the current one first
 * (`og/version.ts`).
 */
export function sponsorCloudCacheControl(opts: {
  readonly avatars: ReadonlyMap<string, string>;
  readonly bubbles: ReadonlyArray<CloudBubble>;
}) {
  const missing = opts.bubbles.some(
    (bubble) => !opts.avatars.has(bubble.image),
  );
  return missing ? 'public, max-age=0, s-maxage=600' : undefined;
}
