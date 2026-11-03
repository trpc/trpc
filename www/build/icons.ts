/**
 * The site's icons in the formats `favicon.svg` doesn't cover: `favicon.ico`,
 * which crawlers and older browsers ask for at the root whatever the page
 * links, and `apple-touch-icon.png` for iOS home screens.
 */
import { Resvg } from '@resvg/resvg-js';
import { Data, Effect } from 'effect';
import type { Plugin } from 'vite';

class IconError extends Data.TaggedError('IconError')<{
  readonly cause: unknown;
}> {}

/** Sizes `favicon.ico` holds, in pixels. */
export const icoSizes = [16, 32, 48] as const;

/** iOS's home screen icon size, in pixels. */
export const appleTouchSize = 180;

/** Packs PNGs into an ICO file, which may hold PNGs as they are (Windows Vista on). */
export function ico(
  images: ReadonlyArray<{ readonly png: Uint8Array; readonly size: number }>,
): Uint8Array {
  const headerSize = 6;
  const entrySize = 16;
  const total =
    headerSize +
    entrySize * images.length +
    images.reduce((sum, image) => sum + image.png.length, 0);
  const bytes = new Uint8Array(total);
  const view = new DataView(bytes.buffer);
  view.setUint16(2, 1, true);
  view.setUint16(4, images.length, true);
  let offset = headerSize + entrySize * images.length;
  images.forEach((image, index) => {
    const entry = headerSize + entrySize * index;
    // 0 means 256.
    view.setUint8(entry, image.size % 256);
    view.setUint8(entry + 1, image.size % 256);
    view.setUint16(entry + 4, 1, true);
    view.setUint16(entry + 6, 32, true);
    view.setUint32(entry + 8, image.png.length, true);
    view.setUint32(entry + 12, offset, true);
    bytes.set(image.png, offset);
    offset += image.png.length;
  });
  return bytes;
}

const renderPng = (svg: string, size: number) =>
  Effect.try({
    catch: (cause) => new IconError({ cause }),
    try: () =>
      new Resvg(svg, { fitTo: { mode: 'width', value: size } })
        .render()
        .asPng(),
  });

/** A PNG rendered from an SVG, `width` pixels wide. */
export interface Png {
  readonly svg: string;
  readonly width: number;
}

/**
 * The icons, by URL path, rendered from the SVG favicon, with `pngs` rendered
 * at theirs.
 */
export const renderIcons = Effect.fn('renderIcons')(function* (
  svg: string,
  pngs: Readonly<Record<string, Png>> = {},
) {
  const images = yield* Effect.forEach(icoSizes, (size) =>
    Effect.map(renderPng(svg, size), (png) => ({ png, size })),
  );
  // iOS rounds the corners itself and fills transparent ones black, so the
  // touch icon is the favicon's square without its rounding.
  const square = svg.replace(/\s+rx="[\d.]+"/, '');
  const favicon = ico(images);
  const rendered = yield* Effect.forEach(
    Object.entries(pngs),
    ([pathname, png]) =>
      Effect.map(
        renderPng(png.svg, png.width),
        (bytes) => [pathname, bytes] as const,
      ),
  );
  return new Map<string, Uint8Array>([
    ['/apple-touch-icon.png', yield* renderPng(square, appleTouchSize)],
    ['/favicon.ico', favicon],
    // Docusaurus's favicon URL, which old links and bookmarks still ask for.
    ['/img/favicon.ico', favicon],
    ...rendered,
  ]);
});

const contentTypeOf = (pathname: string) =>
  pathname.endsWith('.ico') ? 'image/x-icon' : 'image/png';

/** Writes the icons to the client build; the dev server renders them when asked. */
export function siteIcons(options: {
  readonly pngs?: Readonly<Record<string, Png>>;
  readonly svg: string;
}): Plugin {
  const pathnames = new Set([
    '/apple-touch-icon.png',
    '/favicon.ico',
    '/img/favicon.ico',
    ...Object.keys(options.pngs ?? {}),
  ]);
  let icons: Promise<ReadonlyMap<string, Uint8Array>> | undefined;
  const load = () => {
    icons ??= Effect.runPromise(renderIcons(options.svg, options.pngs));
    return icons;
  };
  return {
    configureServer(server) {
      server.middlewares.use((request, response, next) => {
        const pathname = new URL(request.url ?? '/', 'http://localhost')
          .pathname;
        if (!pathnames.has(pathname)) {
          next();
          return;
        }
        load().then((rendered) => {
          response.setHeader('Content-Type', contentTypeOf(pathname));
          response.end(rendered.get(pathname));
        }, next);
      });
    },
    async generateBundle() {
      if (this.environment.name !== 'client') {
        return;
      }
      for (const [pathname, source] of await load()) {
        this.emitFile({ fileName: pathname.slice(1), source, type: 'asset' });
      }
    },
    name: 'site-icons',
  };
}
