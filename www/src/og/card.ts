/**
 * Each page's social card (`og:image`), laid out for satori in the site's
 * light theme: the home page's white, dot grid and blue glow, with the
 * logo's wordmark. The home card shows the GitHub stars and npm downloads, a
 * post its date, reading time and authors, `/sponsor` its partners and the
 * other sponsors' avatars, and every other page its title, description and
 * URL. Every card but `/sponsor`'s names the partners along its foot, with
 * other sponsors' faces. The READMEs' sponsor cloud is laid out here too
 * (`sponsorCloudElement`).
 * `render.ts` draws a card; `routes/og.$.ts` serves it.
 */
import { type CSSProperties, createElement as h, type ReactNode } from 'react';

import { stripInlineCode } from '~/content/inline-code.ts';
import { ogImageSize } from '~/seo.ts';
import { site } from '~/site.ts';
import { cardFooter } from '~/sponsors.ts';

import { type Live, noLive, type Stats } from './live.ts';
import type { CloudBubble } from './sponsor-cloud.ts';

/** A docs page's, and every page's but the home page's and a post's. */
export interface DocCard {
  readonly kind: 'doc';
  readonly description: string;
  readonly path: string;
  readonly title: string;
  /** The page's canonical URL, which the card shows. */
  readonly url: string;
}

export interface HomeCard {
  readonly kind: 'home';
  readonly path: string;
}

/** A post's author, as its frontmatter has them. */
export interface CardAuthor {
  /** Their avatar's URL, which the card fetches (`live.ts`). */
  readonly image?: string | undefined;
  readonly name: string;
  readonly title?: string | undefined;
}

export interface PostCard {
  readonly kind: 'post';
  readonly authors: ReadonlyArray<CardAuthor>;
  /** When it was published: `2025-03-21`. */
  readonly date: string;
  readonly description: string;
  readonly path: string;
  readonly readingMinutes: number;
  readonly title: string;
}

/** A sponsor the sponsor card draws. */
export interface CardSponsor {
  /** Their avatar's URL, which the card fetches (`live.ts`). */
  readonly image: string;
  readonly name: string;
}

/** What every card but `/sponsor`'s names along its foot. */
export interface CardFooter {
  /**
   * The other sponsors, most given first. It draws the faces of those
   * whose avatars load, at most `faceSlots` and as many as fit.
   */
  readonly backers: ReadonlyArray<CardSponsor>;
  readonly faceSlots: number;
  /**
   * Every partner, gold first, then each lower tier, by rank within a
   * tier, each drawn beside their name (`partnerName`).
   */
  readonly partners: ReadonlyArray<CardSponsor>;
  /** Every sponsor, which the count of those it doesn't draw is out of. */
  readonly sponsorCount: number;
}

/** `/sponsor`'s: its headline, its partners, and the other sponsors' avatars. */
export interface SponsorCard {
  readonly kind: 'sponsor';
  /**
   * The sponsors it may draw only as an avatar, most given first. It
   * draws the first `backerSlots` of them whose avatars load, and leaves
   * out a small sponsor whose avatar doesn't; a partner gets initials.
   */
  readonly backers: ReadonlyArray<
    CardSponsor & { readonly partner?: true | undefined }
  >;
  readonly backerSlots: number;
  readonly description: string;
  /**
   * The first partners, gold first, then each lower tier, by rank within a
   * tier, each with their tier's name: `Silver`.
   */
  readonly partners: ReadonlyArray<CardSponsor & { readonly tier: string }>;
  readonly path: string;
  /** Every sponsor, which the count of those it doesn't draw is out of. */
  readonly sponsorCount: number;
  readonly title: string;
  /** Where to sponsor, which the card shows. */
  readonly url: string;
}

export type OgCard = DocCard | HomeCard | PostCard | SponsorCard;

/**
 * The light theme's tokens in `@shared/ui/theme.css`, keyed by name, which
 * a test holds to the stylesheet's values.
 */
export const colors = {
  background: '#ffffff',
  border: '#e4e4e7',
  /** The logo's blue. */
  brand: '#398ccb',
  /** Too light for text on white; for the rule and the glow. */
  brandLight: '#589ed3',
  foreground: '#18181b',
  /** Text links' blue on a light page (`--brand-dark`). */
  link: '#2e77af',
  mutedForeground: '#52525b',
} as const;

export interface Assets {
  /** The home page's dot grid, fading out toward the bottom. */
  readonly dots: string;
  readonly github: string;
  /** A heart in white, for the sponsor card's button. */
  readonly heart: string;
  readonly npm: string;
  /** The logo with its name in black. */
  readonly wordmark: string;
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

/** `text` cut at the last word that fits in `max` characters. */
export const truncateWords = (text: string, max: number) => {
  if (text.length <= max) {
    return text;
  }
  const cut = text.slice(0, max);
  return `${cut.slice(0, cut.lastIndexOf(' '))} …`;
};

/**
 * A character's width in Inter ExtraBold, in ems, as the widest in its
 * class: `W` for the widest, `Q` for the other capitals and digits, `g`
 * for the other lowercase. Satori can't measure text before it lays it
 * out, so names are fitted to this, which errs wide.
 */
const charWidth = (char: string) => {
  if (char === ' ') {
    return 0.22;
  }
  if (/[iIjl.,:;'!]/.test(char)) {
    return 0.36;
  }
  if (/[frt1()[\]{}/\\|`^_-]/.test(char)) {
    return 0.5;
  }
  if (/[a-ln-vx-z]/.test(char)) {
    return 0.64;
  }
  if (/[\u0021-\u007e]/.test(char) && !/[WM@%mw]/.test(char)) {
    return 0.79;
  }
  return 1.06;
};

/** About how wide `text` is in Inter ExtraBold at `fontSize`, erring wide. */
export const textWidth = (text: string, fontSize: number) =>
  [...text].reduce((sum, char) => sum + charWidth(char), 0) * fontSize;

/**
 * The widest a partner's name is drawn, in ems by `textWidth`: room for
 * every partner's today, the widest of which, `CodeRabbit`, is about 6.3.
 */
export const partnerNameEms = 11;

/**
 * A partner's `name` as the cards draw it: whole when it fits in
 * `partnerNameEms`, else cut at the last character that fits with `…`.
 */
export const partnerName = (name: string) => {
  const text = plainText(name);
  if (textWidth(text, 1) <= partnerNameEms) {
    return text;
  }
  const chars = [...text];
  const cut = (end: number) => `${chars.slice(0, end).join('').trimEnd()}…`;
  let end = chars.length;
  while (end > 0 && textWidth(cut(end), 1) > partnerNameEms) {
    end -= 1;
  }
  return cut(end);
};

/** `https://trpc.io/docs/v10/a` as `trpc.io/docs/v10/a`. */
export const displayUrl = (url: string) => {
  const parsed = new URL(url);
  return `${parsed.host}${parsed.pathname === '/' ? '' : parsed.pathname}`;
};

/** `Alex / KATT` as `AK`, for an author whose avatar didn't load. */
export const initials = (name: string) =>
  plainText(name)
    .split(/[\s/]+/)
    .filter((word) => /\p{L}/u.test(word))
    .slice(0, 2)
    .map((word) => [...word][0]?.toUpperCase() ?? '')
    .join('');

/** The part of the site a page is in, which its card names: `Docs · v10`. */
export const sectionLabel = (path: string) => {
  const version = /^\/docs\/(v\d+)(?:\/|$)/.exec(path)?.[1];
  if (version !== undefined) {
    return `Docs · ${version}`;
  }
  if (/^\/docs\/typedoc(?:\/|$)/.test(path)) {
    return 'API reference';
  }
  const section = /^\/([^/]+)/.exec(path)?.[1];
  return section === undefined
    ? site.name
    : `${section[0]?.toUpperCase()}${section.slice(1)}`;
};

const box = (style: CSSProperties, ...children: ReadonlyArray<ReactNode>) =>
  h('div', { style: { display: 'flex', ...style } }, ...children);

/** The wordmark's width over its height, from its `viewBox`. */
const wordmarkRatio = 429 / 128;

const wordmark = (assets: Assets, height: number) =>
  h('img', {
    height,
    src: assets.wordmark,
    width: Math.round(height * wordmarkRatio),
  });

/** The card's width inside its margins. */
const innerWidth = ogImageSize.width - 2 * 72;

/**
 * The bottom fifth of the card, where X, Slack, Discord and LinkedIn may
 * lay the page's title over it: the cards draw nothing there but the
 * background.
 */
const captionBand = Math.round(ogImageSize.height * 0.2);

const gradient = `linear-gradient(90deg, ${colors.link}, ${colors.brandLight})`;

/**
 * White under the home page's dot grid and its blue glow, over a rule in
 * the brand's blues, with `footer` at the foot of what it draws if there
 * is one, above `captionBand`.
 */
const frame = (
  assets: Assets,
  footer: ReactNode | undefined,
  ...children: ReadonlyArray<ReactNode>
) =>
  box(
    {
      backgroundColor: colors.background,
      backgroundImage: [
        'radial-gradient(ellipse 60% 70% at 85% 0%, rgba(57, 140, 203, 0.2), rgba(57, 140, 203, 0) 100%)',
        'radial-gradient(ellipse 45% 55% at 0% 100%, rgba(88, 158, 211, 0.14), rgba(88, 158, 211, 0) 100%)',
      ].join(', '),
      boxSizing: 'border-box',
      color: colors.foreground,
      flexDirection: 'column',
      fontFamily: 'Inter',
      height: '100%',
      position: 'relative',
      width: '100%',
    },
    h('img', {
      height: 630,
      src: assets.dots,
      style: { left: 0, position: 'absolute', top: 0 },
      width: 1200,
    }),
    box(
      {
        boxSizing: 'border-box',
        flex: 1,
        flexDirection: 'column',
        padding: '40px 72px 20px',
        // Above the dot grid, which is positioned.
        position: 'relative',
        width: '100%',
      },
      ...children,
    ),
    ...(footer === undefined ? [] : [footer]),
    box({ flexShrink: 0, height: captionBand }),
    box({
      backgroundImage: gradient,
      bottom: 0,
      height: 10,
      left: 0,
      position: 'absolute',
      width: '100%',
    }),
  );

const pill = (...children: ReadonlyArray<ReactNode>) =>
  box(
    {
      alignItems: 'center',
      backgroundColor: colors.background,
      border: `2px solid ${colors.border}`,
      borderRadius: 999,
      color: colors.mutedForeground,
      fontSize: 26,
      padding: '8px 24px',
    },
    ...children,
  );

/** The wordmark, and on the right the part of the site the page is in. */
const header = (assets: Assets, label: string) =>
  box(
    { alignItems: 'center', justifyContent: 'space-between', width: '100%' },
    wordmark(assets, 52),
    pill(box({ color: colors.link, fontWeight: 800 }, label)),
  );

/** A title's size: smaller as it gets longer, so it stays within three lines. */
export const titleSize = (text: string, largest: number) =>
  text.length <= 32 ? largest : text.length <= 64 ? largest - 8 : largest - 20;

/** Long words, such as an API reference's type names, wrap anywhere. */
const title = (text: string, largest: number) =>
  box(
    {
      fontSize: titleSize(text, largest),
      fontWeight: 800,
      letterSpacing: '-0.02em',
      lineHeight: 1.1,
      wordBreak: 'break-word',
    },
    text,
  );

const description = (text: string) =>
  text === ''
    ? []
    : [
        box(
          {
            color: colors.mutedForeground,
            fontSize: 28,
            lineHeight: 1.4,
            marginTop: 16,
          },
          text,
        ),
      ];

const numberFormat = new Intl.NumberFormat('en-US');

/** The stars and the downloads that loaded, each beside GitHub's or npm's mark. */
const statsRow = (assets: Assets, stats: Stats) =>
  box(
    { alignItems: 'center', gap: 24, marginTop: 28 },
    ...[
      {
        icon: assets.github,
        label: 'GitHub stars',
        size: 34,
        value: stats.stars,
      },
      {
        icon: assets.npm,
        label: 'npm downloads a week',
        size: 30,
        value: stats.downloads,
      },
    ].flatMap((stat) =>
      stat.value === undefined
        ? []
        : [
            pill(
              h('img', { height: stat.size, src: stat.icon, width: stat.size }),
              box(
                {
                  color: colors.foreground,
                  fontSize: 32,
                  fontWeight: 800,
                  marginLeft: 14,
                },
                numberFormat.format(stat.value),
              ),
              box({ fontSize: 26, marginLeft: 10 }, stat.label),
            ),
          ],
    ),
  );

const homeCard = (assets: Assets, stats: Stats, footer: ReactNode) =>
  frame(
    assets,
    footer,
    box(
      {
        alignItems: 'center',
        flexDirection: 'column',
        height: '100%',
        justifyContent: 'center',
        width: '100%',
      },
      wordmark(assets, 96),
      box(
        { marginTop: 28 },
        // Without the period the site's tagline has.
        title(site.tagline[0].replace(/\.$/, ''), 72),
      ),
      box(
        { color: colors.brand, fontSize: 40, fontWeight: 800, marginTop: 12 },
        site.tagline[1],
      ),
      statsRow(assets, stats),
    ),
  );

/**
 * A doc's title, with a long one's trailing type parameters as `<…>`:
 * `Interface: TRPCProcedureBuilder<…>`, as the API reference has them.
 */
export const docTitle = (title: string) => {
  const text = plainText(title);
  return truncateWords(
    text.length > 64 ? text.replace(/<[^<>]*>$/, '<…>') : text,
    90,
  );
};

/**
 * A doc's description, or the site's subtitle for a page without its own:
 * one with none, or one that only repeats its title.
 */
export const docDescription = (doc: Pick<DocCard, 'description' | 'title'>) => {
  const text = plainText(doc.description);
  return text === '' ||
    text.toLowerCase() === plainText(doc.title).toLowerCase()
    ? site.tagline[1]
    : truncateWords(text, 130);
};

const docCard = (assets: Assets, doc: DocCard, footer: ReactNode) =>
  frame(
    assets,
    footer,
    header(assets, sectionLabel(doc.path)),
    box(
      { flex: 1, flexDirection: 'column', justifyContent: 'center' },
      title(docTitle(doc.title), 60),
      ...description(docDescription(doc)),
    ),
    box(
      { color: colors.link, fontSize: 28, fontWeight: 800 },
      displayUrl(doc.url),
    ),
  );

/**
 * A round avatar, or the person's initials on the brand blue when it
 * didn't load (`live.ts` leaves it out).
 */
const avatar = (
  name: string,
  image: string | undefined,
  size = 72,
  style: CSSProperties = {},
) =>
  image === undefined
    ? box(
        {
          alignItems: 'center',
          backgroundColor: colors.brand,
          borderRadius: 999,
          color: colors.background,
          flexShrink: 0,
          fontSize: Math.round(size * 0.39),
          fontWeight: 800,
          height: size,
          justifyContent: 'center',
          width: size,
          ...style,
        },
        initials(name),
      )
    : h('img', {
        height: size,
        src: image,
        style: {
          border: `3px solid ${colors.border}`,
          borderRadius: 999,
          flexShrink: 0,
          ...style,
        },
        width: size,
      });

const postDate = (date: string) =>
  new Intl.DateTimeFormat('en-US', {
    dateStyle: 'long',
    timeZone: 'UTC',
  }).format(new Date(`${date}T00:00:00Z`));

const postCard = (
  assets: Assets,
  post: PostCard,
  live: Live,
  footer: ReactNode,
) =>
  frame(
    assets,
    footer,
    header(assets, 'Blog'),
    box(
      { flex: 1, flexDirection: 'column', justifyContent: 'center' },
      box(
        {
          color: colors.link,
          fontSize: 26,
          fontWeight: 800,
          marginBottom: 12,
        },
        `${postDate(post.date)} · ${post.readingMinutes} min read`,
      ),
      title(truncateWords(plainText(post.title), 70), 56),
      ...description(truncateWords(plainText(post.description), 110)),
    ),
    box(
      { alignItems: 'center', gap: 40 },
      ...post.authors.map((author) =>
        box(
          { alignItems: 'center', gap: 18 },
          avatar(
            author.name,
            author.image === undefined
              ? undefined
              : live.avatars.get(author.image),
            64,
          ),
          box(
            { flexDirection: 'column' },
            box({ fontSize: 28, fontWeight: 800 }, plainText(author.name)),
            ...(author.title === undefined
              ? []
              : [
                  box(
                    {
                      color: colors.mutedForeground,
                      fontSize: 22,
                      marginTop: 2,
                    },
                    plainText(author.title),
                  ),
                ]),
          ),
        ),
      ),
    ),
  );

/** A filled button, as the site's primary ones are: `♥ Sponsor tRPC`. */
const sponsorButton = (assets: Assets) =>
  box(
    {
      alignItems: 'center',
      backgroundColor: colors.brand,
      borderRadius: 999,
      color: colors.background,
      fontSize: 28,
      fontWeight: 800,
      gap: 12,
      padding: '12px 28px',
    },
    h('img', { height: 28, src: assets.heart, width: 28 }),
    `Sponsor ${site.name}`,
  );

const backerSize = 52;

/** The backers `card` draws: a partner always, a small sponsor if their avatar loaded. */
export const drawnBackers = (card: SponsorCard, live: Live) =>
  card.backers
    .filter(
      (backer) => backer.partner === true || live.avatars.has(backer.image),
    )
    .slice(0, card.backerSlots);

/** The sizes a partner's name may take on `/sponsor`'s card, largest first. */
export const partnerNameSizes = [28, 26, 24, 22, 20] as const;

const partnerLabel = (partner: SponsorCard['partners'][number]) =>
  `${partner.tier} partner`;

/**
 * The largest name size at which `partners` fit on one line in
 * `width`, each beside their avatar with their tier under their name as
 * `partnerName` draws it. When none does, they wrap at the largest.
 */
export function partnerRowLayout(
  partners: SponsorCard['partners'],
  width: number,
) {
  const rowWidth = (size: number) =>
    partners.reduce(
      (sum, partner) =>
        sum +
        72 +
        18 +
        Math.max(
          textWidth(partnerName(partner.name), size),
          textWidth(partnerLabel(partner), size - 6),
        ),
      0,
    ) +
    44 * Math.max(0, partners.length - 1);
  const nameSize =
    partnerNameSizes.find((size) => rowWidth(size) <= width) ??
    partnerNameSizes[0];
  return { nameSize, wraps: rowWidth(nameSize) > width };
}

const sponsorCard = (assets: Assets, card: SponsorCard, live: Live) => {
  const backers = drawnBackers(card, live);
  const more = card.sponsorCount - card.partners.length - backers.length;
  const row = partnerRowLayout(card.partners, innerWidth);
  return frame(
    assets,
    undefined,
    box(
      { alignItems: 'center', justifyContent: 'space-between', width: '100%' },
      wordmark(assets, 52),
      sponsorButton(assets),
    ),
    box(
      { flex: 1, flexDirection: 'column', justifyContent: 'center' },
      title(plainText(card.title), 64),
      ...description(plainText(card.description)),
    ),
    ...(card.partners.length === 0
      ? []
      : [
          box(
            {
              alignItems: 'center',
              columnGap: 44,
              flexWrap: row.wraps ? 'wrap' : 'nowrap',
              rowGap: 16,
            },
            ...card.partners.map((partner) =>
              box(
                { alignItems: 'center', flexShrink: 0, gap: 18 },
                avatar(partner.name, live.avatars.get(partner.image)),
                box(
                  { flexDirection: 'column' },
                  box(
                    {
                      fontSize: row.nameSize,
                      fontWeight: 800,
                      whiteSpace: 'nowrap',
                    },
                    partnerName(partner.name),
                  ),
                  box(
                    {
                      color: colors.link,
                      fontSize: row.nameSize - 6,
                      fontWeight: 800,
                      marginTop: 2,
                      whiteSpace: 'nowrap',
                    },
                    partnerLabel(partner),
                  ),
                ),
              ),
            ),
          ),
        ]),
    box(
      {
        alignItems: 'center',
        justifyContent: 'space-between',
        marginTop: 32,
        width: '100%',
      },
      box(
        { alignItems: 'center' },
        ...backers.map((backer, index) =>
          avatar(backer.name, live.avatars.get(backer.image), backerSize, {
            border: `3px solid ${colors.background}`,
            marginLeft: index === 0 ? 0 : -14,
          }),
        ),
        ...(more === 0
          ? []
          : [
              box(
                {
                  color: colors.mutedForeground,
                  fontSize: 26,
                  fontWeight: 800,
                  marginLeft: backers.length === 0 ? 0 : 16,
                },
                `+${more}`,
              ),
            ]),
      ),
      box(
        {
          color: colors.link,
          flexShrink: 0,
          fontSize: 28,
          fontWeight: 800,
          marginLeft: 32,
        },
        displayUrl(card.url),
      ),
    ),
  );
};

/** `sponsors` whose avatars loaded, each with its avatar's `data:` URI. */
const loaded = (sponsors: ReadonlyArray<CardSponsor>, live: Live) =>
  sponsors.flatMap((sponsor) => {
    const image = live.avatars.get(sponsor.image);
    return image === undefined
      ? []
      : [{ image, name: plainText(sponsor.name) }];
  });

const footerLabel = 'SUPPORTED BY';
const footerLabelSize = 17;
const footerLabelSpacing = 0.08;
const faceSize = 34;
/** How far each face sits from the one before, over which it overlaps. */
const faceStep = faceSize - 10;
const moreSize = 20;

const footerAvatarSize = (nameSize: number) => nameSize + 12;

/** The sizes a partner's name may take along the foot, largest first. */
export const footerNameSizes = [22, 20, 18, 16] as const;

/** The foot gives up the largest name size to draw at least this many faces. */
const fewestFaces = 6;

/** The foot's partners, each beside their name, at what fits. */
export interface FooterLayout {
  readonly faces: number;
  readonly nameSize: number;
  /**
   * When the names don't fit on one line at any size, they wrap at the
   * smallest, so the foot takes as few lines as it can.
   */
  readonly wraps: boolean;
}

/**
 * How the foot fits the partners' `names`, as `partnerName` draws them, and
 * up to `faces` faces into `width`: the largest name size that leaves room
 * for a few faces, else the largest at which the names fit, then as many
 * faces as fit.
 */
export function footerLayout(
  names: ReadonlyArray<string>,
  faces: number,
  sponsorCount: number,
  width: number,
): FooterLayout {
  const room =
    width -
    textWidth(footerLabel, footerLabelSize) -
    footerLabel.length * footerLabelSpacing * footerLabelSize -
    32;
  const namesWidth = (size: number) =>
    names.reduce(
      (sum, name) =>
        sum + footerAvatarSize(size) + 10 + textWidth(partnerName(name), size),
      0,
    ) +
    28 * Math.max(0, names.length - 1);
  const facesWidth = (count: number) => {
    if (count === 0) {
      return 0;
    }
    const more = sponsorCount - names.length - count;
    return (
      32 +
      faceSize +
      faceStep * (count - 1) +
      (more > 0 ? 10 + textWidth(`+${more}`, moreSize) : 0)
    );
  };
  const fewest = Math.min(fewestFaces, faces);
  const nameSize =
    footerNameSizes.find(
      (size) => namesWidth(size) + facesWidth(fewest) <= room,
    ) ??
    footerNameSizes.find((size) => namesWidth(size) <= room) ??
    footerNameSizes[footerNameSizes.length - 1] ??
    16;
  const wraps = namesWidth(nameSize) > room;
  let drawn = wraps ? 0 : faces;
  while (drawn > 0 && namesWidth(nameSize) + facesWidth(drawn) > room) {
    drawn -= 1;
  }
  return { faces: drawn, nameSize, wraps };
}

/**
 * Along the foot of every card but `/sponsor`'s, which draws them larger:
 * the partners whose avatars loaded, each beside their name, as the home
 * page's "Supported by" has their logos, then the faces of as many
 * other sponsors as fit, and a count of the rest. With no partner and no
 * face loaded, there's no strip.
 */
const sponsorsFooter = (footer: CardFooter, live: Live): ReactNode => {
  const partners = loaded(footer.partners, live);
  const backers = loaded(footer.backers, live).slice(0, footer.faceSlots);
  if (partners.length === 0 && backers.length === 0) {
    return undefined;
  }
  const layout = footerLayout(
    partners.map((partner) => partner.name),
    backers.length,
    footer.sponsorCount,
    innerWidth,
  );
  const faces = backers.slice(0, layout.faces);
  const more = footer.sponsorCount - partners.length - faces.length;
  return box(
    {
      boxSizing: 'border-box',
      flexShrink: 0,
      padding: '0 72px',
      position: 'relative',
      width: '100%',
    },
    box(
      {
        alignItems: 'center',
        borderTop: `2px solid ${colors.border}`,
        paddingTop: 16,
        width: '100%',
      },
      box(
        {
          color: colors.mutedForeground,
          flexShrink: 0,
          fontSize: footerLabelSize,
          fontWeight: 800,
          letterSpacing: `${footerLabelSpacing}em`,
          marginRight: 32,
        },
        footerLabel,
      ),
      box(
        {
          alignItems: 'center',
          columnGap: 28,
          flexShrink: layout.wraps ? 1 : 0,
          flexWrap: layout.wraps ? 'wrap' : 'nowrap',
          rowGap: 8,
        },
        ...partners.map((partner) =>
          box(
            { alignItems: 'center', flexShrink: 0, gap: 10 },
            avatar(
              partner.name,
              partner.image,
              footerAvatarSize(layout.nameSize),
              { border: `2px solid ${colors.border}` },
            ),
            box(
              {
                color: colors.foreground,
                fontSize: layout.nameSize,
                fontWeight: 800,
                whiteSpace: 'nowrap',
              },
              partnerName(partner.name),
            ),
          ),
        ),
      ),
      ...(faces.length === 0
        ? []
        : [
            box(
              { alignItems: 'center', flexShrink: 0, marginLeft: 'auto' },
              ...faces.map((face, index) =>
                avatar(face.name, face.image, faceSize, {
                  border: `2px solid ${colors.background}`,
                  marginLeft: index === 0 ? 0 : faceStep - faceSize,
                }),
              ),
              ...(more > 0
                ? [
                    box(
                      {
                        color: colors.mutedForeground,
                        fontSize: moreSize,
                        fontWeight: 800,
                        marginLeft: 10,
                      },
                      `+${more}`,
                    ),
                  ]
                : []),
            ),
          ]),
    ),
  );
};

export const cardElement = (
  assets: Assets,
  ogCard: OgCard,
  live: Live = noLive,
  footer: CardFooter = cardFooter,
) => {
  switch (ogCard.kind) {
    case 'doc':
      return docCard(assets, ogCard, sponsorsFooter(footer, live));
    case 'home':
      return homeCard(assets, live.stats, sponsorsFooter(footer, live));
    case 'post':
      return postCard(assets, ogCard, live, sponsorsFooter(footer, live));
    case 'sponsor':
      return sponsorCard(assets, ogCard, live);
  }
};

/**
 * The sponsor cloud (`sponsor-cloud.ts`) at `size`, with nothing behind it: each sponsor's avatar in a white circle with a faint ring,
 * which reads on GitHub's light and dark themes alike, or their initials on
 * the brand blue when it didn't load.
 */
export const sponsorCloudElement = (
  bubbles: ReadonlyArray<CloudBubble>,
  avatars: ReadonlyMap<string, string>,
  size: { readonly height: number; readonly width: number },
) =>
  box(
    { fontFamily: 'Inter', position: 'relative', ...size },
    ...bubbles.map((bubble) => {
      const image = avatars.get(bubble.image);
      const diameter = bubble.r * 2;
      const ring = Math.max(1, Math.round(diameter / 80));
      const inner = diameter - 2 * ring;
      return box(
        {
          alignItems: 'center',
          backgroundColor:
            image === undefined ? colors.brand : colors.background,
          border: `${ring}px solid rgba(24, 24, 27, 0.12)`,
          borderRadius: 999,
          color: colors.background,
          fontSize: Math.round(diameter * 0.36),
          fontWeight: 800,
          height: diameter,
          justifyContent: 'center',
          left: bubble.x - bubble.r,
          overflow: 'hidden',
          position: 'absolute',
          top: bubble.y - bubble.r,
          width: diameter,
        },
        image === undefined
          ? initials(bubble.name)
          : h('img', {
              height: inner,
              src: image,
              style: { borderRadius: 999, objectFit: 'cover' },
              width: inner,
            }),
      );
    }),
  );

export const dataUri = (type: string, bytes: Uint8Array) =>
  `data:${type};base64,${Buffer.from(bytes).toString('base64')}`;

/** GitHub's mark and npm's, in the text's color. */
const githubMark = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" fill="${colors.foreground}"><path d="M256 32C132.3 32 32 134.9 32 261.7c0 101.5 64.2 187.5 153.2 217.9a17.56 17.56 0 003.8.4c8.3 0 11.5-6.1 11.5-11.4 0-5.5-.2-19.9-.3-39.1a102.4 102.4 0 01-22.6 2.7c-43.1 0-52.9-33.5-52.9-33.5-10.2-26.5-24.9-33.6-24.9-33.6-19.5-13.7-.1-14.1 1.4-14.1h.1c22.5 2 34.3 23.8 34.3 23.8 11.2 19.6 26.2 25.1 39.6 25.1a63 63 0 0025.6-6c2-14.8 7.8-24.9 14.2-30.7-49.7-5.8-102-25.5-102-113.5 0-25.1 8.7-45.6 23-61.6-2.3-5.8-10-29.2 2.2-60.8a18.64 18.64 0 015-.5c8.1 0 26.4 3.1 56.6 24.1a208.21 208.21 0 01112.2 0c30.2-21 48.5-24.1 56.6-24.1a18.64 18.64 0 015 .5c12.2 31.6 4.5 55 2.2 60.8 14.3 16.1 23 36.6 23 61.6 0 88.2-52.4 107.6-102.3 113.3 8 7.1 15.2 21.1 15.2 42.5 0 30.7-.3 55.5-.3 63 0 5.4 3.1 11.5 11.4 11.5a19.35 19.35 0 004-.4C415.9 449.2 480 363.1 480 261.7 480 134.9 379.7 32 256 32z"/></svg>`;
const npmMark = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="${colors.foreground}"><path d="M1.763 0C.786 0 0 .786 0 1.763v20.474C0 23.214.786 24 1.763 24h20.474c.977 0 1.763-.786 1.763-1.763V1.763C24 .786 23.214 0 22.237 0zM5.13 5.323l13.837.019-.009 13.836h-3.464l.01-10.382h-3.456L12.04 19.17H5.113z"/></svg>`;

/**
 * The home page's grid of dots in the border's gray, wider apart than its
 * 24px so they stay visible on a small card, fading out toward the bottom.
 */
const dots = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630"><defs><pattern id="p" width="32" height="32" patternUnits="userSpaceOnUse"><circle cx="2" cy="2" r="2" fill="${colors.border}"/></pattern><linearGradient id="f" x2="0" y2="1"><stop stop-color="#fff"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></linearGradient><mask id="m"><rect width="1200" height="630" fill="url(#f)"/></mask></defs><rect width="1200" height="630" fill="url(#p)" mask="url(#m)"/></svg>`;

const heartMark = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="${colors.background}"><path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54z"/></svg>`;

/** The dot grid, the marks the home card draws its numbers beside, and the sponsor card's heart. */
export const drawnAssets = () => ({
  dots: dataUri('image/svg+xml', Buffer.from(dots)),
  github: dataUri('image/svg+xml', Buffer.from(githubMark)),
  heart: dataUri('image/svg+xml', Buffer.from(heartMark)),
  npm: dataUri('image/svg+xml', Buffer.from(npmMark)),
});
