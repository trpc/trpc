/**
 * Each page's social card (`og:image`), laid out for satori as trpc.io's
 * old card service (`www/og-image`) drew them: its pattern
 * (`og-pattern-dark.svg`) and logo, with the landing card's GitHub stars and
 * npm downloads, a post's date, reading time and authors, and a doc's title,
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

/** Tailwind's, which the old cards were styled with. */
export const colors = {
  /** `blue-500` */
  accent: '#3b82f6',
  /** `zinc-900` */
  background: '#18181b',
  /** `zinc-300` */
  muted: '#d4d4d8',
  text: '#ffffff',
} as const;

export interface Assets {
  readonly github: string;
  readonly logo: string;
  readonly npm: string;
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

/** `text` cut at the last word that fits in `max` characters, as the old cards cut it. */
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

const box = (style: CSSProperties, ...children: ReadonlyArray<ReactNode>) =>
  h('div', { style: { display: 'flex', ...style } }, ...children);

const logo = (assets: Assets, size: number) =>
  h('img', { height: size, src: assets.logo, width: size });

const card = (assets: Assets, ...children: ReadonlyArray<ReactNode>) =>
  box(
    {
      backgroundColor: colors.background,
      backgroundImage: `url(${assets.pattern})`,
      backgroundSize: '1280px 640px',
      boxSizing: 'border-box',
      color: colors.text,
      flexDirection: 'column',
      fontFamily: 'Inter',
      height: '100%',
      padding: 56,
      width: '100%',
    },
    ...children,
  );

const numberFormat = new Intl.NumberFormat('en-US');

/** The stars and the downloads that loaded, beside GitHub's and npm's marks. */
const statsRow = (assets: Assets, stats: Stats) =>
  box(
    { alignItems: 'center', color: colors.muted, marginTop: 40 },
    ...[
      { height: 36, icon: assets.github, value: stats.stars },
      { height: 32, icon: assets.npm, value: stats.downloads },
    ].flatMap((stat) =>
      stat.value === undefined
        ? []
        : [
            box(
              { alignItems: 'center', margin: '0 32px' },
              h('img', {
                height: stat.height,
                src: stat.icon,
                width: stat.height,
              }),
              box(
                { fontSize: 30, fontWeight: 800, marginLeft: 8 },
                numberFormat.format(stat.value),
              ),
            ),
          ],
    ),
  );

const homeCard = (assets: Assets, stats: Stats) =>
  card(
    assets,
    box(
      {
        alignItems: 'center',
        flexDirection: 'column',
        height: '100%',
        justifyContent: 'center',
        width: '100%',
      },
      box(
        { alignItems: 'center' },
        logo(assets, 128),
        box({ fontSize: 96, fontWeight: 800, marginLeft: 32 }, site.name),
      ),
      box(
        { fontSize: 60, fontWeight: 800, paddingTop: 24 },
        // The old card's, without the period the site's tagline has.
        site.tagline[0].replace(/\.$/, ''),
      ),
      box(
        { color: colors.muted, fontSize: 36, paddingTop: 12 },
        site.tagline[1],
      ),
      statsRow(assets, stats),
    ),
  );

const docCard = (assets: Assets, doc: DocCard) => {
  const description = truncateWords(plainText(doc.description), 215);
  return card(
    assets,
    box(
      {
        alignItems: 'center',
        flexDirection: 'column',
        height: '100%',
        justifyContent: 'center',
        textAlign: 'center',
        width: '100%',
      },
      logo(assets, 100),
      box(
        { fontSize: 60, fontWeight: 800, lineHeight: 1.2, paddingTop: 12 },
        plainText(doc.title),
      ),
      ...(description === ''
        ? []
        : [
            box(
              {
                color: colors.muted,
                fontSize: 30,
                justifyContent: 'center',
                lineHeight: 1.4,
                marginTop: 24,
              },
              description,
            ),
          ]),
      box(
        { color: colors.accent, fontSize: 30, marginTop: 24 },
        displayUrl(doc.url),
      ),
    ),
  );
};

const avatarSize = 75;

const avatar = (author: CardAuthor, image: string | undefined) =>
  image === undefined
    ? box(
        {
          alignItems: 'center',
          backgroundColor: colors.accent,
          borderRadius: 12,
          flexShrink: 0,
          fontSize: 30,
          fontWeight: 800,
          height: avatarSize,
          justifyContent: 'center',
          marginRight: 24,
          width: avatarSize,
        },
        initials(author.name),
      )
    : h('img', {
        height: avatarSize,
        src: image,
        style: { borderRadius: 12, flexShrink: 0, marginRight: 24 },
        width: avatarSize,
      });

const postDate = (date: string) =>
  new Intl.DateTimeFormat('en-US', {
    dateStyle: 'long',
    timeZone: 'UTC',
  }).format(new Date(`${date}T00:00:00Z`));

const postCard = (assets: Assets, post: PostCard, live: Live) =>
  card(
    assets,
    box(
      {
        flexDirection: 'column',
        height: '100%',
        justifyContent: 'space-between',
        width: '100%',
      },
      box(
        { flexDirection: 'column', width: '100%' },
        box(
          {
            alignItems: 'center',
            justifyContent: 'space-between',
            width: '100%',
          },
          box(
            { flex: 1, flexDirection: 'column', paddingRight: 24 },
            box(
              { color: colors.accent, fontSize: 24, fontWeight: 800 },
              postDate(post.date),
            ),
            box(
              { fontSize: 60, fontWeight: 800, lineHeight: 1.25 },
              truncateWords(plainText(post.title), 70),
            ),
          ),
          logo(assets, 84),
        ),
        box(
          {
            color: colors.muted,
            fontSize: 30,
            lineHeight: 1.375,
            marginTop: 24,
          },
          truncateWords(plainText(post.description), 145),
        ),
        box(
          {
            color: colors.accent,
            fontSize: 24,
            fontWeight: 800,
            marginTop: 20,
          },
          `${post.readingMinutes} min read`,
        ),
      ),
      box(
        { alignItems: 'center' },
        ...post.authors.map((author, index) =>
          box(
            {
              alignItems: 'center',
              marginRight: index === post.authors.length - 1 ? 0 : 32,
            },
            avatar(
              author,
              author.image === undefined
                ? undefined
                : live.avatars.get(author.image),
            ),
            box(
              { flexDirection: 'column', justifyContent: 'center' },
              box({ fontSize: 24, fontWeight: 800 }, plainText(author.name)),
              ...(author.title === undefined
                ? []
                : [
                    box(
                      { color: colors.muted, fontSize: 20 },
                      plainText(author.title),
                    ),
                  ]),
            ),
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

/** GitHub's mark and npm's, as the old landing card drew them, in white. */
const githubMark =
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" fill="#fff"><path d="M256 32C132.3 32 32 134.9 32 261.7c0 101.5 64.2 187.5 153.2 217.9a17.56 17.56 0 003.8.4c8.3 0 11.5-6.1 11.5-11.4 0-5.5-.2-19.9-.3-39.1a102.4 102.4 0 01-22.6 2.7c-43.1 0-52.9-33.5-52.9-33.5-10.2-26.5-24.9-33.6-24.9-33.6-19.5-13.7-.1-14.1 1.4-14.1h.1c22.5 2 34.3 23.8 34.3 23.8 11.2 19.6 26.2 25.1 39.6 25.1a63 63 0 0025.6-6c2-14.8 7.8-24.9 14.2-30.7-49.7-5.8-102-25.5-102-113.5 0-25.1 8.7-45.6 23-61.6-2.3-5.8-10-29.2 2.2-60.8a18.64 18.64 0 015-.5c8.1 0 26.4 3.1 56.6 24.1a208.21 208.21 0 01112.2 0c30.2-21 48.5-24.1 56.6-24.1a18.64 18.64 0 015 .5c12.2 31.6 4.5 55 2.2 60.8 14.3 16.1 23 36.6 23 61.6 0 88.2-52.4 107.6-102.3 113.3 8 7.1 15.2 21.1 15.2 42.5 0 30.7-.3 55.5-.3 63 0 5.4 3.1 11.5 11.4 11.5a19.35 19.35 0 004-.4C415.9 449.2 480 363.1 480 261.7 480 134.9 379.7 32 256 32z"/></svg>';
const npmMark =
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="#fff"><path d="M1.763 0C.786 0 0 .786 0 1.763v20.474C0 23.214.786 24 1.763 24h20.474c.977 0 1.763-.786 1.763-1.763V1.763C24 .786 23.214 0 22.237 0zM5.13 5.323l13.837.019-.009 13.836h-3.464l.01-10.382h-3.456L12.04 19.17H5.113z"/></svg>';

/** The marks the home card draws its numbers beside. */
export const drawnAssets = () => ({
  github: dataUri('image/svg+xml', Buffer.from(githubMark)),
  npm: dataUri('image/svg+xml', Buffer.from(npmMark)),
});
