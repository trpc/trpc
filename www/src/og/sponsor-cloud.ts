/**
 * `/sponsor`'s cloud of sponsors as a PNG, for the READMEs
 * (`build/sponsors-readme.ts`): each sponsor a circle of their avatar,
 * packed as the page packs them (`components/sponsors/pack.ts`), on a
 * transparent square. `routes/og.$.ts` serves it at `sponsorCloudPath`,
 * with the avatars fetched on request (`live.ts`); `render.ts` draws it.
 *
 * The build scripts import this with Node, so it imports nothing through
 * `~/`.
 */
import { cloudPadding, packSponsors } from '../components/sponsors/pack.ts';
import { site } from '../site.ts';
import { avatarUrl, type Sponsor, sponsorKey } from '../sponsors.ts';

export const sponsorCloudPath = '/og/sponsor-cloud.png';

/** The PNG's side in pixels: twice the width the READMEs show it at. */
export const sponsorCloudSize = 1200;

/** The width the READMEs show it at, in CSS pixels. */
export const sponsorCloudWidth = sponsorCloudSize / 2;

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

const drawn = (sponsors: ReadonlyArray<Sponsor>) =>
  sponsors.filter((sponsor) => sponsor.imageless !== true);

/** `sponsors`' circles, but the imageless: as `/sponsor` draws them, in pixels. */
export function cloudBubbles(
  sponsors: ReadonlyArray<Sponsor>,
): ReadonlyArray<CloudBubble> {
  const side = sponsorCloudSize - 2 * margin;
  return packSponsors(drawn(sponsors), cloudPadding).map((bubble) => ({
    image: avatarUrl(
      bubble.sponsor,
      avatarSizes.find((size) => size >= bubble.r * 2 * side) ?? 460,
    ),
    name: bubble.sponsor.name,
    r: bubble.r * side,
    x: margin + bubble.x * side,
    y: margin + bubble.y * side,
  }));
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
 * joins or leaves, or their weight, avatar or name does.
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
 * didn't load, or when `requested` asks for another version than
 * `current`'s (a README from just before a deploy, or a package's on npm
 * from an older one), and as a page otherwise (`undefined`).
 */
export function sponsorCloudCacheControl(opts: {
  readonly avatars: ReadonlyMap<string, string>;
  readonly bubbles: ReadonlyArray<CloudBubble>;
  readonly current: string;
  readonly requested: string | null;
}) {
  const stale = opts.requested !== null && opts.requested !== opts.current;
  const missing = opts.bubbles.some(
    (bubble) => !opts.avatars.has(bubble.image),
  );
  return stale || missing ? 'public, max-age=0, s-maxage=600' : undefined;
}
