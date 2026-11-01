/**
 * Each page's social card (`og:image`), rendered at build time: satori lays
 * out the card as SVG and resvg rasterizes it. A modern take on trpc.io's
 * cards (`v11/www/og-image`), with its pattern and per-page
 * title, description and URL, and without its network calls.
 */
import { createHash } from 'node:crypto';
import { availableParallelism } from 'node:os';

import { NodeServices } from '@effect/platform-node';
import { renderAsync, Resvg } from '@resvg/resvg-js';
import { Data, Effect, FileSystem, Option, Path } from 'effect';
import { Heart } from 'lucide-react';
import {
  type CSSProperties,
  createElement as h,
  type JSX,
  type ReactNode,
} from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import satori, { type Font } from 'satori';
import type { Plugin } from 'vite';

import { partnerLogos } from '../src/components/sponsors/partner-logos.tsx';
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
    readonly version: CopiedVersion['id'];
  };
  Home: { readonly path: string };
  /** A page of its own, like `/media`. */
  Page: {
    readonly description: string;
    readonly eyebrow: string;
    readonly path: string;
    /** Top right, where a doc's card has its version. */
    readonly pill: string;
    readonly title: string;
    readonly url: string;
  };
  /** The blog, or one of its posts. */
  Post: {
    readonly description: string;
    /** Above the title: the post's date and authors. */
    readonly eyebrow: string;
    readonly path: string;
    readonly title: string;
    readonly url: string;
  };
  /** `/sponsor`'s: its headline, and the partners' logos. */
  Sponsor: {
    readonly headline: string;
    /** Under the headline. */
    readonly lede: string;
    readonly partners: ReadonlyArray<{
      readonly login: string;
      readonly name: string;
    }>;
    readonly path: string;
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

interface Picture {
  /** Width over height. */
  readonly aspect: number;
  readonly src: string;
}

interface Assets {
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

const sponsorCard = (
  assets: Assets,
  sponsor: Data.TaggedEnum.Value<OgCard, 'Sponsor'>,
) =>
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

const cardElement = (assets: Assets, ogCard: OgCard) =>
  OgCard.$match(ogCard, {
    Doc: (doc) => docCard(assets, doc),
    Home: () => homeCard(assets),
    Page: (page) => articleCard(assets, page),
    Post: (post) => postCard(assets, post),
    Sponsor: (sponsor) => sponsorCard(assets, sponsor),
  });

const dataUri = (type: string, bytes: Uint8Array) =>
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

const fontFiles = [
  ['Inter', 400, '@fontsource/inter/files/inter-latin-400-normal.woff'],
  ['Inter', 800, '@fontsource/inter/files/inter-latin-800-normal.woff'],
  [
    'JetBrains Mono',
    500,
    '@fontsource/jetbrains-mono/files/jetbrains-mono-latin-500-normal.woff',
  ],
] as const;

const rasterOptions = { font: { loadSystemFonts: false } } as const;

/** Cached cards no build has read for this long are deleted. */
const maxAgeMs = 14 * 24 * 60 * 60 * 1000;

/**
 * Loads the fonts and images once; the result renders a card as PNG.
 *
 * Rasterizing is most of a card's time, so with a `cacheDir` a PNG is kept
 * there under a hash of its SVG and resvg's version, and a card whose SVG
 * didn't change is read back instead.
 */
export const makeOgRenderer = Effect.fn('makeOgRenderer')(function* (
  cacheDir?: string,
) {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const read = (url: URL) => Effect.flatMap(path.fromFileUrl(url), fs.readFile);
  const resvgVersion = yield* Effect.map(
    fs.readFileString(
      path.join(
        path.dirname(
          yield* path.fromFileUrl(
            new URL(import.meta.resolve('@resvg/resvg-js')),
          ),
        ),
        'package.json',
      ),
    ),
    (json) => String((JSON.parse(json) as { version?: unknown }).version),
  );
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
    heart: svgPicture(h(Heart, { fill: colors.heart }), colors.heart).src,
    logo: dataUri(
      'image/svg+xml',
      yield* read(new URL('../public/favicon.svg', import.meta.url)),
    ),
    partnerLogos: new Map(
      Object.entries(partnerLogos).flatMap(([login, Logo]) =>
        Logo === undefined ? [] : [[login, svgPicture(h(Logo), colors.text)]],
      ),
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
    // On libuv's threads, so a build's cards rasterize in parallel.
    const rasterize = Effect.tryPromise({
      catch: fail,
      try: async () => (await renderAsync(svg, rasterOptions)).asPng(),
    });
    if (cacheDir === undefined) {
      return yield* rasterize;
    }
    const file = path.join(
      cacheDir,
      `${createHash('sha256')
        .update(JSON.stringify([resvgVersion, rasterOptions, svg]))
        .digest('hex')}.png`,
    );
    const cached = yield* fs.readFile(file).pipe(Effect.option);
    if (Option.isSome(cached)) {
      const now = new Date();
      yield* fs.utimes(file, now, now).pipe(Effect.ignore);
      return cached.value;
    }
    const png = yield* rasterize;
    yield* fs.makeDirectory(cacheDir, { recursive: true }).pipe(
      Effect.andThen(fs.writeFile(file, png)),
      Effect.catch((error) =>
        Effect.logWarning(`Couldn't write the card cache: ${error.message}`),
      ),
    );
    return png;
  });
});

/** Deletes cached cards no build has read for two weeks. */
const pruneCache = Effect.fn('pruneCache')(function* (cacheDir: string) {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const names = yield* fs
    .readDirectory(cacheDir)
    .pipe(Effect.orElseSucceed((): Array<string> => []));
  yield* Effect.forEach(
    names,
    (name) =>
      Effect.gen(function* () {
        const file = path.join(cacheDir, name);
        const info = yield* fs.stat(file);
        const mtime = Option.getOrElse(info.mtime, () => new Date(0));
        if (Date.now() - mtime.getTime() > maxAgeMs) {
          yield* fs.remove(file);
        }
      }).pipe(Effect.ignore),
    { concurrency: 64 },
  );
});

/**
 * Writes `cards` to the client build at `ogImagePath(card.path)`, which
 * `pageHead` points `og:image` at. The dev server renders a card when it's
 * asked for.
 */
export function ogImages(options: {
  /** Where rasterized cards are kept between builds. */
  readonly cacheDir?: string | undefined;
  readonly cards: ReadonlyArray<OgCard>;
}): Plugin {
  const byFile = new Map(
    options.cards.map((ogCard) => [ogImagePath(ogCard.path), ogCard]),
  );
  let renderer: ReturnType<typeof loadRenderer> | undefined;
  const loadRenderer = () =>
    Effect.runPromise(
      Effect.provide(makeOgRenderer(options.cacheDir), NodeServices.layer),
    );
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
      const pngs = await Effect.runPromise(
        Effect.forEach(
          byFile,
          ([file, ogCard]) =>
            Effect.map(
              Effect.promise(() => render(ogCard)),
              (png) => [file, png] as const,
            ),
          { concurrency: availableParallelism() },
        ),
      );
      for (const [file, png] of pngs) {
        this.emitFile({ fileName: file.slice(1), source: png, type: 'asset' });
      }
      if (options.cacheDir !== undefined) {
        await Effect.runPromise(
          Effect.provide(pruneCache(options.cacheDir), NodeServices.layer),
        );
      }
      this.environment.logger.info(
        `og: ${byFile.size} social cards in ${Math.round(performance.now() - started)}ms`,
      );
    },
    name: 'og-images',
  };
}
