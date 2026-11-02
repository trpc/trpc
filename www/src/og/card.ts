/**
 * Each page's social card (`og:image`), laid out for satori around the
 * logo: its wordmark on the logo's ink, lit by the mark's blue-to-cyan
 * gradient. The home card shows the GitHub stars and npm downloads, a post
 * its date, reading time and authors, and every other page its title,
 * description and URL. `render.ts` draws a card; `routes/og.$.ts` serves it.
 */
import { type CSSProperties, createElement as h, type ReactNode } from 'react';

import { stripInlineCode } from '~/content/inline-code.ts';
import { site } from '~/site.ts';

import { type Live, noLive, type Stats } from './live.ts';

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

export type OgCard = DocCard | HomeCard | PostCard;

/** The logo's colors, and text that keeps AA contrast on its ink. */
export const colors = {
  /** The site's link blue on dark pages (`--brand-light`). */
  accent: '#4f9bff',
  /** The logo's ink. */
  background: '#060a23',
  /** The mark's gradient, from its blue to its cyan. */
  brand: '#066dfc',
  cyan: '#22d4fc',
  muted: '#a9b4d0',
  text: '#ffffff',
} as const;

export interface Assets {
  readonly github: string;
  readonly npm: string;
  /** The logo with its name, in white. */
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
const wordmarkRatio = 314.364 / 84.998;

const wordmark = (assets: Assets, height: number) =>
  h('img', {
    height,
    src: assets.wordmark,
    width: Math.round(height * wordmarkRatio),
  });

const gradient = `linear-gradient(90deg, ${colors.brand}, ${colors.cyan})`;

/** The ink, lit by the mark's colors, over a rule in its gradient. */
const frame = (...children: ReadonlyArray<ReactNode>) =>
  box(
    {
      backgroundColor: colors.background,
      backgroundImage: [
        'radial-gradient(circle at 100% 0%, rgba(6, 109, 252, 0.5), rgba(6, 109, 252, 0) 55%)',
        'radial-gradient(circle at 0% 100%, rgba(34, 212, 252, 0.16), rgba(34, 212, 252, 0) 45%)',
      ].join(', '),
      boxSizing: 'border-box',
      color: colors.text,
      flexDirection: 'column',
      fontFamily: 'Inter',
      height: '100%',
      position: 'relative',
      width: '100%',
    },
    box(
      {
        boxSizing: 'border-box',
        flexDirection: 'column',
        height: '100%',
        padding: '56px 72px 64px',
        width: '100%',
      },
      ...children,
    ),
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
      backgroundColor: 'rgba(255, 255, 255, 0.06)',
      border: '2px solid rgba(255, 255, 255, 0.14)',
      borderRadius: 999,
      color: colors.muted,
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
    pill(label),
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
            color: colors.muted,
            fontSize: 32,
            lineHeight: 1.4,
            marginTop: 24,
          },
          text,
        ),
      ];

const numberFormat = new Intl.NumberFormat('en-US');

/** The stars and the downloads that loaded, each beside GitHub's or npm's mark. */
const statsRow = (assets: Assets, stats: Stats) =>
  box(
    { alignItems: 'center', gap: 24, marginTop: 48 },
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
                  color: colors.text,
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

const homeCard = (assets: Assets, stats: Stats) =>
  frame(
    box(
      {
        alignItems: 'center',
        flexDirection: 'column',
        height: '100%',
        justifyContent: 'center',
        width: '100%',
      },
      wordmark(assets, 120),
      box(
        { marginTop: 44 },
        // Without the period the site's tagline has.
        title(site.tagline[0].replace(/\.$/, ''), 72),
      ),
      box(
        { color: colors.muted, fontSize: 36, marginTop: 16 },
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

const docCard = (assets: Assets, doc: DocCard) =>
  frame(
    header(assets, sectionLabel(doc.path)),
    box(
      { flex: 1, flexDirection: 'column', justifyContent: 'center' },
      title(docTitle(doc.title), 72),
      ...description(docDescription(doc)),
    ),
    box(
      { color: colors.accent, fontSize: 30, fontWeight: 800 },
      displayUrl(doc.url),
    ),
  );

const avatarSize = 72;

const avatar = (author: CardAuthor, image: string | undefined) =>
  image === undefined
    ? box(
        {
          alignItems: 'center',
          backgroundImage: gradient,
          borderRadius: 999,
          flexShrink: 0,
          fontSize: 28,
          fontWeight: 800,
          height: avatarSize,
          justifyContent: 'center',
          width: avatarSize,
        },
        initials(author.name),
      )
    : h('img', {
        height: avatarSize,
        src: image,
        style: {
          border: '3px solid rgba(255, 255, 255, 0.2)',
          borderRadius: 999,
          flexShrink: 0,
        },
        width: avatarSize,
      });

const postDate = (date: string) =>
  new Intl.DateTimeFormat('en-US', {
    dateStyle: 'long',
    timeZone: 'UTC',
  }).format(new Date(`${date}T00:00:00Z`));

const postCard = (assets: Assets, post: PostCard, live: Live) =>
  frame(
    header(assets, 'Blog'),
    box(
      { flex: 1, flexDirection: 'column', justifyContent: 'center' },
      box(
        {
          color: colors.cyan,
          fontSize: 26,
          fontWeight: 800,
          marginBottom: 16,
        },
        `${postDate(post.date)} · ${post.readingMinutes} min read`,
      ),
      title(truncateWords(plainText(post.title), 70), 64),
      ...description(truncateWords(plainText(post.description), 110)),
    ),
    box(
      { alignItems: 'center', gap: 40 },
      ...post.authors.map((author) =>
        box(
          { alignItems: 'center', gap: 18 },
          avatar(
            author,
            author.image === undefined
              ? undefined
              : live.avatars.get(author.image),
          ),
          box(
            { flexDirection: 'column' },
            box({ fontSize: 28, fontWeight: 800 }, plainText(author.name)),
            ...(author.title === undefined
              ? []
              : [
                  box(
                    { color: colors.muted, fontSize: 22, marginTop: 2 },
                    plainText(author.title),
                  ),
                ]),
          ),
        ),
      ),
    ),
  );

export const cardElement = (
  assets: Assets,
  ogCard: OgCard,
  live: Live = noLive,
) => {
  switch (ogCard.kind) {
    case 'doc':
      return docCard(assets, ogCard);
    case 'home':
      return homeCard(assets, live.stats);
    case 'post':
      return postCard(assets, ogCard, live);
  }
};

export const dataUri = (type: string, bytes: Uint8Array) =>
  `data:${type};base64,${Buffer.from(bytes).toString('base64')}`;

/** GitHub's mark and npm's, in white. */
const githubMark =
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" fill="#fff"><path d="M256 32C132.3 32 32 134.9 32 261.7c0 101.5 64.2 187.5 153.2 217.9a17.56 17.56 0 003.8.4c8.3 0 11.5-6.1 11.5-11.4 0-5.5-.2-19.9-.3-39.1a102.4 102.4 0 01-22.6 2.7c-43.1 0-52.9-33.5-52.9-33.5-10.2-26.5-24.9-33.6-24.9-33.6-19.5-13.7-.1-14.1 1.4-14.1h.1c22.5 2 34.3 23.8 34.3 23.8 11.2 19.6 26.2 25.1 39.6 25.1a63 63 0 0025.6-6c2-14.8 7.8-24.9 14.2-30.7-49.7-5.8-102-25.5-102-113.5 0-25.1 8.7-45.6 23-61.6-2.3-5.8-10-29.2 2.2-60.8a18.64 18.64 0 015-.5c8.1 0 26.4 3.1 56.6 24.1a208.21 208.21 0 01112.2 0c30.2-21 48.5-24.1 56.6-24.1a18.64 18.64 0 015 .5c12.2 31.6 4.5 55 2.2 60.8 14.3 16.1 23 36.6 23 61.6 0 88.2-52.4 107.6-102.3 113.3 8 7.1 15.2 21.1 15.2 42.5 0 30.7-.3 55.5-.3 63 0 5.4 3.1 11.5 11.4 11.5a19.35 19.35 0 004-.4C415.9 449.2 480 363.1 480 261.7 480 134.9 379.7 32 256 32z"/></svg>';
const npmMark =
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="#fff"><path d="M1.763 0C.786 0 0 .786 0 1.763v20.474C0 23.214.786 24 1.763 24h20.474c.977 0 1.763-.786 1.763-1.763V1.763C24 .786 23.214 0 22.237 0zM5.13 5.323l13.837.019-.009 13.836h-3.464l.01-10.382h-3.456L12.04 19.17H5.113z"/></svg>';

/** The marks the home card draws its numbers beside. */
export const drawnAssets = () => ({
  github: dataUri('image/svg+xml', Buffer.from(githubMark)),
  npm: dataUri('image/svg+xml', Buffer.from(npmMark)),
});
