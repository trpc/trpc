/**
 * Each page's social card (`og:image`), rendered at build time: satori lays
 * out the card as SVG and resvg rasterizes it. A modern take on trpc.io's
 * cards (`v11/www/og-image`), with its pattern and per-page
 * title, description and URL, and without its network calls.
 */
import { NodeServices } from '@effect/platform-node';
import { Resvg } from '@resvg/resvg-js';
import { Data, Effect, FileSystem, Path } from 'effect';
import { type CSSProperties, createElement as h, type ReactNode } from 'react';
import satori, { type Font } from 'satori';
import type { Plugin } from 'vite';

import { stripInlineCode } from '../src/content/inline-code.ts';
import { ogImagePath, ogImageSize } from '../src/seo.ts';
import { type CopiedVersion, site } from '../src/site.ts';

export type OgCard = Data.TaggedEnum<{
  Doc: {
    /** May be empty: most of the older versions' pages have none. */
    readonly description: string;
    readonly path: string;
    readonly section: string;
    readonly title: string;
    /** The page's canonical URL, which the card shows. */
    readonly url: string;
    readonly version: 'v12' | CopiedVersion['id'];
  };
  Home: { readonly path: string };
  /** The blog, or one of its posts. */
  Post: {
    readonly description: string;
    /** Above the title: the post's date and authors. */
    readonly eyebrow: string;
    readonly path: string;
    readonly title: string;
    readonly url: string;
  };
}>;
export const OgCard = Data.taggedEnum<OgCard>();

class OgImageError extends Data.TaggedError('OgImageError')<{
  readonly cause: unknown;
  readonly path: string;
}> {
  override get message() {
    return `Couldn't render the social card for ${this.path}: ${String(this.cause)}`;
  }
}

const colors = {
  background: '#09090b',
  border: '#27272a',
  brand: '#398ccb',
  brandLight: '#7ab6e2',
  muted: '#a1a1aa',
  subtle: '#71717a',
  surface: '#18181b',
  text: '#fafafa',
} as const;

const versionLabels = {
  v9: 'v9 · unmaintained',
  v10: 'v10 · unmaintained',
  v11: 'v11 · stable',
  v12: 'v12 · experimental',
} as const satisfies Record<'v12' | CopiedVersion['id'], string>;

interface Assets {
  readonly logo: string;
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

/** `https://v12.trpc.io/v12/docs/a` as `v12.trpc.io` and `/v12/docs/a`. */
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

const docCard = (assets: Assets, doc: Data.TaggedEnum.Value<OgCard, 'Doc'>) =>
  articleCard(assets, {
    description: doc.description,
    eyebrow: doc.section,
    pill: versionLabels[doc.version],
    title: doc.title,
    url: doc.url,
  });

const postCard = (
  assets: Assets,
  post: Data.TaggedEnum.Value<OgCard, 'Post'>,
) => articleCard(assets, { ...post, pill: 'blog' });

const homeCard = (assets: Assets) =>
  card(
    assets,
    box(
      { alignItems: 'center', justifyContent: 'space-between' },
      wordmark(assets, 88),
      pill(versionLabels.v12),
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
        h('span', { style: { color: colors.text } }, 'pnpm add @trpc12/trpc'),
      ),
      url(site.url, 26),
    ),
  );

const cardElement = (assets: Assets, ogCard: OgCard) =>
  OgCard.$match(ogCard, {
    Doc: (doc) => docCard(assets, doc),
    Home: () => homeCard(assets),
    Post: (post) => postCard(assets, post),
  });

const dataUri = (type: string, bytes: Uint8Array) =>
  `data:${type};base64,${Buffer.from(bytes).toString('base64')}`;

const fontFiles = [
  ['Inter', 400, '@fontsource/inter/files/inter-latin-400-normal.woff'],
  ['Inter', 800, '@fontsource/inter/files/inter-latin-800-normal.woff'],
  [
    'JetBrains Mono',
    500,
    '@fontsource/jetbrains-mono/files/jetbrains-mono-latin-500-normal.woff',
  ],
] as const;

/** Loads the fonts and images once; the result renders a card as PNG. */
export const makeOgRenderer = Effect.fn('makeOgRenderer')(function* () {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const read = (url: URL) => Effect.flatMap(path.fromFileUrl(url), fs.readFile);
  const fonts: Array<Font> = yield* Effect.forEach(fontFiles, (font) =>
    Effect.map(read(new URL(import.meta.resolve(font[2]))), (data) => ({
      data: Buffer.from(data),
      name: font[0],
      style: 'normal' as const,
      weight: font[1],
    })),
  );
  const patternSvg = yield* fs.readFileString(
    yield* path.fromFileUrl(new URL('og/pattern.svg', import.meta.url)),
  );
  const assets: Assets = {
    logo: dataUri(
      'image/svg+xml',
      yield* read(new URL('../public/favicon.svg', import.meta.url)),
    ),
    // A bitmap, so each card composites it instead of redrawing its paths.
    pattern: dataUri(
      'image/png',
      new Resvg(patternSvg, { fitTo: { mode: 'width', value: 1200 } })
        .render()
        .asPng(),
    ),
  };
  return Effect.fn('renderOgImage')(function* (ogCard: OgCard) {
    const fail = (cause: unknown) =>
      new OgImageError({ cause, path: ogCard.path });
    const svg = yield* Effect.tryPromise({
      catch: fail,
      try: () => satori(cardElement(assets, ogCard), { ...ogImageSize, fonts }),
    });
    return yield* Effect.try({
      catch: fail,
      try: () =>
        new Resvg(svg, { font: { loadSystemFonts: false } }).render().asPng(),
    });
  });
});

/**
 * Writes `cards` to the client build at `ogImagePath(card.path)`, which
 * `pageHead` points `og:image` at. The dev server renders a card when it's
 * asked for.
 */
export function ogImages(options: {
  readonly cards: ReadonlyArray<OgCard>;
}): Plugin {
  const byFile = new Map(
    options.cards.map((ogCard) => [ogImagePath(ogCard.path), ogCard]),
  );
  let renderer: ReturnType<typeof loadRenderer> | undefined;
  const loadRenderer = () =>
    Effect.runPromise(Effect.provide(makeOgRenderer(), NodeServices.layer));
  const render = async (ogCard: OgCard) => {
    renderer ??= loadRenderer();
    return Effect.runPromise((await renderer)(ogCard));
  };

  return {
    configureServer(server) {
      server.middlewares.use((request, response, next) => {
        const ogCard = byFile.get(
          new URL(request.url ?? '/', 'http://localhost').pathname,
        );
        if (!ogCard) {
          next();
          return;
        }
        render(ogCard).then((png) => {
          response.setHeader('Content-Type', 'image/png');
          response.setHeader('Cache-Control', 'no-cache');
          response.end(png);
        }, next);
      });
    },
    async generateBundle() {
      if (this.environment.name !== 'client') {
        return;
      }
      const started = performance.now();
      for (const [file, ogCard] of byFile) {
        this.emitFile({
          fileName: file.slice(1),
          source: await render(ogCard),
          type: 'asset',
        });
      }
      this.environment.logger.info(
        `og: ${byFile.size} social cards in ${Math.round(performance.now() - started)}ms`,
      );
    },
    name: 'og-images',
  };
}
