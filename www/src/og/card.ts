/**
 * Each page's social card (`og:image`), laid out for satori: tRPC's
 * pattern, logo and colors, with the page's title, description and URL.
 * `render.ts` draws a card; `routes/og.$.ts` serves it.
 */
import { Heart } from 'lucide-react';
import {
  type CSSProperties,
  createElement as h,
  type JSX,
  type ReactNode,
} from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

import { partnerLogos } from '~/components/sponsors/partner-logos.tsx';
import { stripInlineCode } from '~/content/inline-code.ts';
import { type CopiedVersion, site } from '~/site.ts';

export interface DocCard {
  readonly kind: 'doc';
  /** May be empty: most of the older versions' pages have none. */
  readonly description: string;
  readonly path: string;
  readonly section: string;
  readonly title: string;
  /** The page's canonical URL, which the card shows. */
  readonly url: string;
  readonly version: CopiedVersion['id'];
}

export interface HomeCard {
  readonly kind: 'home';
  readonly path: string;
}

/** A page of its own, like `/media`. */
export interface PageCard {
  readonly kind: 'page';
  readonly description: string;
  readonly eyebrow: string;
  readonly path: string;
  /** Top right, where a doc's card has its version. */
  readonly pill: string;
  readonly title: string;
  readonly url: string;
}

/** The blog, or one of its posts. */
export interface PostCard {
  readonly kind: 'post';
  readonly description: string;
  /** Above the title: the post's date and authors. */
  readonly eyebrow: string;
  readonly path: string;
  readonly title: string;
  readonly url: string;
}

/** `/sponsor`'s: its headline, and the partners' logos. */
export interface SponsorCard {
  readonly kind: 'sponsor';
  readonly headline: string;
  /** Under the headline. */
  readonly lede: string;
  readonly partners: ReadonlyArray<{
    readonly login: string;
    readonly name: string;
  }>;
  readonly path: string;
  readonly url: string;
}

export type OgCard = DocCard | HomeCard | PageCard | PostCard | SponsorCard;

export const colors = {
  background: '#09090b',
  border: '#27272a',
  brand: '#398ccb',
  brandLight: '#7ab6e2',
  /** `/sponsor`'s heart and glow, Tailwind's pink-500 as on the page. */
  heart: '#ec4899',
  heartLight: '#f9a8d4',
  muted: '#a1a1aa',
  subtle: '#71717a',
  surface: '#18181b',
  text: '#fafafa',
} as const;

const versionLabels = {
  v9: 'v9 · unmaintained',
  v10: 'v10 · unmaintained',
  v11: 'v11 · stable',
} as const satisfies Record<CopiedVersion['id'], string>;

export interface Picture {
  /** Width over height. */
  readonly aspect: number;
  readonly src: string;
}

export interface Assets {
  readonly heart: string;
  readonly logo: string;
  /** The drawn partner logos, by login, in the card's text color. */
  readonly partnerLogos: ReadonlyMap<string, Picture>;
  readonly pattern: string;
}

/**
 * The fonts carry Latin only; an emoji (`TanStack React Query (⭐️)`) would
 * render as a missing glyph. Code spans lose their backticks.
 */
export const plainText = (text: string) =>
  stripInlineCode(text)
    .replaceAll(/\(\s*(?:\p{Extended_Pictographic}\uFE0F?\s*)+\)/gu, '')
    .replaceAll(/\p{Extended_Pictographic}\uFE0F?/gu, '')
    .replaceAll(/\s+/g, ' ')
    .trim();

/** `https://trpc.io/docs/v10/a` as `trpc.io` and `/docs/v10/a`. */
export const displayUrl = (url: string) => {
  const parsed = new URL(url);
  return {
    host: parsed.host,
    path: parsed.pathname === '/' ? '' : parsed.pathname,
  };
};

const box = (style: CSSProperties, ...children: ReadonlyArray<ReactNode>) =>
  h('div', { style: { display: 'flex', ...style } }, ...children);

/** Text that wraps, cut to `lines` lines with an ellipsis. */
const paragraph = (style: CSSProperties, lines: number, text: string) =>
  h('div', { style: { display: 'block', lineClamp: lines, ...style } }, text);

const backdrop = (assets: Assets) => [
  h('img', {
    height: 600,
    key: 'pattern',
    src: assets.pattern,
    style: {
      left: 0,
      maskImage: 'linear-gradient(to left, white 15%, transparent 75%)',
      opacity: 0.22,
      position: 'absolute',
      top: 15,
    },
    width: 1200,
  }),
  box({
    backgroundImage: `radial-gradient(circle at 100% 0%, ${colors.brand}59 0%, ${colors.brand}00 55%)`,
    height: '100%',
    left: 0,
    position: 'absolute',
    top: 0,
    width: '100%',
  }),
  box({
    backgroundImage: `linear-gradient(to right, ${colors.brand}, ${colors.brand}00 80%)`,
    bottom: 0,
    height: 6,
    left: 0,
    position: 'absolute',
    width: '100%',
  }),
];

const pill = (text: string) =>
  box(
    {
      backgroundColor: `${colors.brand}1f`,
      border: `1.5px solid ${colors.brand}80`,
      borderRadius: 999,
      color: colors.brandLight,
      fontFamily: 'JetBrains Mono',
      fontSize: 22,
      fontWeight: 500,
      padding: '8px 20px',
    },
    text,
  );

const wordmark = (assets: Assets, size: number) =>
  box(
    { alignItems: 'center', gap: size * 0.36 },
    h('img', { height: size, src: assets.logo, width: size }),
    box(
      {
        color: colors.text,
        fontSize: size * 0.64,
        fontWeight: 800,
        letterSpacing: '-0.02em',
      },
      'tRPC',
    ),
  );

const url = (address: string, size: number) => {
  const shown = displayUrl(address);
  return box(
    { fontFamily: 'JetBrains Mono', fontSize: size, fontWeight: 500 },
    h('span', { style: { color: colors.text } }, shown.host),
    h('span', { style: { color: colors.subtle } }, shown.path),
  );
};

const card = (assets: Assets, ...children: ReadonlyArray<ReactNode>) =>
  box(
    {
      backgroundColor: colors.background,
      boxSizing: 'border-box',
      color: colors.text,
      flexDirection: 'column',
      fontFamily: 'Inter',
      height: '100%',
      padding: '64px 72px 60px',
      position: 'relative',
      width: '100%',
    },
    ...backdrop(assets),
    ...children,
  );

/** A page's card: the pill, the eyebrow above the title, and the description. */
const articleCard = (
  assets: Assets,
  article: {
    readonly description: string;
    readonly eyebrow: string;
    readonly pill: string;
    readonly title: string;
    readonly url: string;
  },
) => {
  const description = plainText(article.description);
  const eyebrow = plainText(article.eyebrow);
  const title = plainText(article.title);
  return card(
    assets,
    box(
      { alignItems: 'center', justifyContent: 'space-between' },
      wordmark(assets, 56),
      pill(article.pill),
    ),
    box(
      { flexDirection: 'column', flexGrow: 1, justifyContent: 'center' },
      // v11's first page is `tRPC`, in the section `tRPC`.
      ...(eyebrow === '' || eyebrow.toLowerCase() === title.toLowerCase()
        ? []
        : [
            box(
              {
                color: colors.brandLight,
                fontFamily: 'JetBrains Mono',
                fontSize: 24,
                fontWeight: 500,
                letterSpacing: '0.06em',
                marginBottom: 16,
                textTransform: 'uppercase',
              },
              eyebrow,
            ),
          ]),
      paragraph(
        {
          fontSize: 72,
          fontWeight: 800,
          letterSpacing: '-0.035em',
          lineHeight: 1.08,
          maxWidth: 1000,
        },
        2,
        title,
      ),
      ...(description === ''
        ? []
        : [
            paragraph(
              {
                color: colors.muted,
                fontSize: 30,
                lineHeight: 1.4,
                marginTop: 20,
                maxWidth: 980,
              },
              2,
              description,
            ),
          ]),
    ),
    box(
      { borderTop: `1px solid ${colors.border}`, paddingTop: 26 },
      url(article.url, 24),
    ),
  );
};

const homeCard = (assets: Assets) =>
  card(
    assets,
    box(
      { alignItems: 'center', justifyContent: 'space-between' },
      wordmark(assets, 88),
      pill(versionLabels.v11),
    ),
    box(
      { flexDirection: 'column', flexGrow: 1, justifyContent: 'center' },
      box(
        {
          fontSize: 74,
          fontWeight: 800,
          letterSpacing: '-0.04em',
          lineHeight: 1.05,
        },
        site.tagline[0],
      ),
      box(
        { color: colors.muted, fontSize: 40, marginTop: 20 },
        site.tagline[1],
      ),
    ),
    box(
      { alignItems: 'center', justifyContent: 'space-between' },
      box(
        {
          backgroundColor: colors.surface,
          border: `1px solid ${colors.border}`,
          borderRadius: 14,
          fontFamily: 'JetBrains Mono',
          fontSize: 26,
          fontWeight: 500,
          padding: '16px 24px',
        },
        h('span', { style: { color: colors.subtle, marginRight: 16 } }, '$'),
        h(
          'span',
          { style: { color: colors.text } },
          'pnpm add @trpc/server @trpc/client',
        ),
      ),
      url(site.url, 26),
    ),
  );

const partnerLogoHeight = 40;

const partnerMark = (
  assets: Assets,
  partner: { readonly login: string; readonly name: string },
) => {
  const logo = assets.partnerLogos.get(partner.login);
  return logo === undefined
    ? box(
        { color: colors.text, fontSize: 32, fontWeight: 800 },
        plainText(partner.name),
      )
    : h('img', {
        height: partnerLogoHeight,
        key: partner.login,
        src: logo.src,
        width: Math.round(partnerLogoHeight * logo.aspect),
      });
};

const sponsorCard = (assets: Assets, sponsor: SponsorCard) =>
  card(
    assets,
    box({
      backgroundImage: `radial-gradient(circle at 0% 100%, ${colors.heart}38 0%, ${colors.heart}00 50%)`,
      height: '100%',
      left: 0,
      position: 'absolute',
      top: 0,
      width: '100%',
    }),
    box(
      { alignItems: 'center', justifyContent: 'space-between' },
      wordmark(assets, 56),
      url(sponsor.url, 24),
    ),
    box(
      { flexDirection: 'column', flexGrow: 1, justifyContent: 'center' },
      box(
        { marginBottom: 24 },
        box(
          {
            alignItems: 'center',
            backgroundColor: `${colors.heart}1f`,
            border: `1.5px solid ${colors.heart}80`,
            borderRadius: 999,
            color: colors.heartLight,
            fontSize: 26,
            fontWeight: 800,
            gap: 10,
            padding: '8px 22px 8px 18px',
          },
          h('img', { height: 26, src: assets.heart, width: 26 }),
          'Sponsor tRPC',
        ),
      ),
      paragraph(
        {
          fontSize: 80,
          fontWeight: 800,
          letterSpacing: '-0.04em',
          lineHeight: 1.04,
          maxWidth: 900,
        },
        2,
        plainText(sponsor.headline),
      ),
      box(
        { color: colors.muted, fontSize: 32, marginTop: 22 },
        plainText(sponsor.lede),
      ),
    ),
    box(
      {
        alignItems: 'center',
        borderTop: `1px solid ${colors.border}`,
        gap: 44,
        paddingTop: 30,
      },
      box(
        {
          color: colors.subtle,
          fontFamily: 'JetBrains Mono',
          fontSize: 20,
          fontWeight: 500,
          letterSpacing: '0.08em',
          textTransform: 'uppercase',
        },
        'Partners',
      ),
      ...sponsor.partners.map((partner) => partnerMark(assets, partner)),
      box(
        {
          border: `2px dashed ${colors.border}`,
          borderRadius: 10,
          color: colors.subtle,
          fontSize: 22,
          padding: '8px 18px',
        },
        'Your logo here',
      ),
    ),
  );

export const cardElement = (assets: Assets, ogCard: OgCard) => {
  switch (ogCard.kind) {
    case 'doc':
      return articleCard(assets, {
        description: ogCard.description,
        eyebrow: ogCard.section,
        pill: versionLabels[ogCard.version],
        title: ogCard.title,
        url: ogCard.url,
      });
    case 'home':
      return homeCard(assets);
    case 'page':
      return articleCard(assets, ogCard);
    case 'post':
      return articleCard(assets, { ...ogCard, pill: 'blog' });
    case 'sponsor':
      return sponsorCard(assets, ogCard);
  }
};

export const dataUri = (type: string, bytes: Uint8Array) =>
  `data:${type};base64,${Buffer.from(bytes).toString('base64')}`;

/** A component that draws an `<svg>` with a `viewBox`, as an image in `color`. */
const svgPicture = (element: JSX.Element, color: string): Picture => {
  const markup = renderToStaticMarkup(element);
  const viewBox = /viewBox="\S+ \S+ (\S+) (\S+)"/.exec(markup);
  // A standalone SVG needs its namespace, which React leaves to the page.
  const namespace = /^<svg[^>]* xmlns=/.test(markup)
    ? ''
    : ' xmlns="http://www.w3.org/2000/svg"';
  return {
    aspect: viewBox === null ? 1 : Number(viewBox[1]) / Number(viewBox[2]),
    src: dataUri(
      'image/svg+xml',
      Buffer.from(markup.replace(/^<svg/, `<svg${namespace} color="${color}"`)),
    ),
  };
};

/** The heart and the partners' logos, drawn for the cards. */
export const drawnAssets = () => ({
  heart: svgPicture(h(Heart, { fill: colors.heart }), colors.heart).src,
  partnerLogos: new Map(
    Object.entries(partnerLogos).flatMap(([login, Logo]) =>
      Logo === undefined ? [] : [[login, svgPicture(h(Logo), colors.text)]],
    ),
  ),
});
