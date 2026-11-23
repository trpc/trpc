/**
 * Draws a social card, or the READMEs' sponsor cloud, as a PNG: satori lays it out as SVG and resvg
 * rasterizes it. Both run as WebAssembly, and the fonts, logo and wasm are
 * inlined, so the server build renders cards without `node_modules` or
 * files of its own.
 */
import interRegular from '@fontsource/inter/files/inter-latin-400-normal.woff?inline';
import interExtraBold from '@fontsource/inter/files/inter-latin-800-normal.woff?inline';
import { initWasm, Resvg } from '@resvg/resvg-wasm';
import resvgWasm from '@resvg/resvg-wasm/index_bg.wasm?inline';
import type { ReactNode } from 'react';
import satori, { type Font } from 'satori';

import wordmarkSvg from '../../public/img/logo-text-black.svg?raw';
import { ogImageSize } from '../seo.ts';
import {
  type Assets,
  type CardFooter,
  cardElement,
  dataUri,
  drawnAssets,
  type OgCard,
  sponsorCloudElement,
} from './card.ts';
import { type Live, noLive } from './live.ts';
import { type CloudLayout, sponsorCloudWidth } from './sponsor-cloud.ts';

/** The bytes of a `data:` URI that `?inline` made. */
const inlined = (uri: string) =>
  Buffer.from(uri.slice(uri.indexOf(',') + 1), 'base64');

const fonts: Array<Font> = [
  { data: inlined(interRegular), name: 'Inter', style: 'normal', weight: 400 },
  {
    data: inlined(interExtraBold),
    name: 'Inter',
    style: 'normal',
    weight: 800,
  },
];

const load = async (): Promise<Assets> => {
  await initWasm(inlined(resvgWasm)).catch((error: unknown) => {
    // Vite's dev server runs this module again on an edit; resvg stays set up.
    if (!String(error).includes('Already initialized')) {
      throw error;
    }
  });
  return {
    ...drawnAssets(),
    wordmark: dataUri('image/svg+xml', Buffer.from(wordmarkSvg)),
  };
};

let assets: Promise<Assets> | undefined;

const loaded = () =>
  (assets ??= load().catch((error: unknown) => {
    assets = undefined;
    throw error;
  }));

const toPng = async (
  element: ReactNode,
  size: { readonly height: number; readonly width: number },
) => {
  const svg = await satori(element, { ...size, fonts });
  const png = new Resvg(svg, { font: { loadSystemFonts: false } })
    .render()
    .asPng();
  // A copy, which `Response` takes: its `BodyInit` wants an `ArrayBuffer`.
  return new Uint8Array(png);
};

/** `ogCard` as a 1200×630 PNG, with what it shows `live`, and the sponsors in `footer` along its foot. */
export async function renderOgImage(
  ogCard: OgCard,
  live: Live = noLive,
  footer?: CardFooter,
) {
  return toPng(cardElement(await loaded(), ogCard, live, footer), ogImageSize);
}

/** The sponsor cloud laid out as `layout` as a transparent PNG, with the `avatars` that loaded. */
export async function renderSponsorCloud(
  layout: CloudLayout,
  avatars: ReadonlyMap<string, string> = new Map(),
) {
  await loaded();
  const size = { height: layout.height, width: sponsorCloudWidth };
  return toPng(sponsorCloudElement(layout.bubbles, avatars, size), size);
}
