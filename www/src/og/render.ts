/**
 * Draws a social card as a PNG: satori lays it out as SVG and resvg
 * rasterizes it. Both run as WebAssembly, and the fonts, logo and wasm are
 * inlined, so the server build renders cards without `node_modules` or
 * files of its own.
 */
import interRegular from '@fontsource/inter/files/inter-latin-400-normal.woff?inline';
import interExtraBold from '@fontsource/inter/files/inter-latin-800-normal.woff?inline';
import jetBrainsMono from '@fontsource/jetbrains-mono/files/jetbrains-mono-latin-500-normal.woff?inline';
import { initWasm, Resvg } from '@resvg/resvg-wasm';
import resvgWasm from '@resvg/resvg-wasm/index_bg.wasm?inline';
import satori, { type Font } from 'satori';

import logoSvg from '../../public/favicon.svg?raw';
import { ogImageSize } from '../seo.ts';
import { type Assets, cardElement, dataUri, drawnAssets, type OgCard } from './card.ts';
import patternSvg from './pattern.svg?raw';

/** The bytes of a `data:` URI that `?inline` made. */
const inlined = (uri: string) =>
  Buffer.from(uri.slice(uri.indexOf(',') + 1), 'base64');

const fonts: Array<Font> = [
  { data: inlined(interRegular), name: 'Inter', style: 'normal', weight: 400 },
  { data: inlined(interExtraBold), name: 'Inter', style: 'normal', weight: 800 },
  {
    data: inlined(jetBrainsMono),
    name: 'JetBrains Mono',
    style: 'normal',
    weight: 500,
  },
];

const load = async (): Promise<Assets> => {
  await initWasm(inlined(resvgWasm));
  return {
    ...drawnAssets(),
    logo: dataUri('image/svg+xml', Buffer.from(logoSvg)),
    // A bitmap, so each card composites it instead of redrawing its paths.
    pattern: dataUri(
      'image/png',
      new Resvg(patternSvg, { fitTo: { mode: 'width', value: 1200 } })
        .render()
        .asPng(),
    ),
  };
};

let assets: Promise<Assets> | undefined;

/** `ogCard` as a 1200×630 PNG. */
export async function renderOgImage(ogCard: OgCard) {
  assets ??= load().catch((error: unknown) => {
    assets = undefined;
    throw error;
  });
  const svg = await satori(cardElement(await assets, ogCard), {
    ...ogImageSize,
    fonts,
  });
  const png = new Resvg(svg, { font: { loadSystemFonts: false } })
    .render()
    .asPng();
  // A copy, which `Response` takes: its `BodyInit` wants an `ArrayBuffer`.
  return new Uint8Array(png);
}
