import { describe, expect, it } from '@effect/vitest';
import { Effect } from 'effect';

import { appleTouchSize, ico, icoSizes, renderIcons } from './icons.ts';

const svg =
  '<svg width="512" height="512" viewBox="0 0 512 512" xmlns="http://www.w3.org/2000/svg"><rect width="512" height="512" rx="150" fill="#398CCB"/></svg>';

/** A PNG's width, from its `IHDR` chunk. */
const pngWidth = (png: Uint8Array) =>
  new DataView(png.buffer, png.byteOffset).getUint32(16);

describe('ico', () => {
  it('packs PNGs behind a directory of their sizes and offsets', () => {
    const bytes = ico([
      { png: new Uint8Array([1, 2, 3]), size: 16 },
      { png: new Uint8Array([4, 5]), size: 256 },
    ]);
    const view = new DataView(bytes.buffer);
    expect([view.getUint16(0, true), view.getUint16(2, true)]).toEqual([0, 1]);
    expect(view.getUint16(4, true)).toBe(2);
    expect(view.getUint8(6)).toBe(16);
    expect(view.getUint8(6 + 16)).toBe(0);
    expect(view.getUint32(6 + 8, true)).toBe(3);
    expect(view.getUint32(6 + 12, true)).toBe(38);
    expect(view.getUint32(6 + 16 + 12, true)).toBe(41);
    expect(bytes.slice(38)).toEqual(new Uint8Array([1, 2, 3, 4, 5]));
  });
});

describe('renderIcons', () => {
  it.effect('renders the favicon at each ICO size, and the touch icon', () =>
    Effect.gen(function* () {
      const icons = yield* renderIcons(svg);
      const favicon = icons.get('/favicon.ico') ?? new Uint8Array();
      const view = new DataView(favicon.buffer, favicon.byteOffset);
      expect(view.getUint16(4, true)).toBe(icoSizes.length);
      icoSizes.forEach((size, index) => {
        const offset = view.getUint32(6 + 16 * index + 12, true);
        expect(pngWidth(favicon.slice(offset))).toBe(size);
      });
      const touch = icons.get('/apple-touch-icon.png') ?? new Uint8Array();
      expect(pngWidth(touch)).toBe(appleTouchSize);
    }),
  );
});
