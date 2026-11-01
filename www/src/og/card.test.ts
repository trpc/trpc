import { describe, expect, it } from 'vitest';

import { ogImagePath } from '../seo.ts';
import { displayUrl, plainText } from './card.ts';

describe('ogImagePath', () => {
  it('mirrors the page path under /og', () => {
    expect(ogImagePath('/')).toBe('/og/index.png');
    expect(ogImagePath('/v10/docs/client/links')).toBe(
      '/og/v10/docs/client/links.png',
    );
    expect(ogImagePath('/docs/quickstart')).toBe('/og/docs/quickstart.png');
  });
});

describe('plainText', () => {
  it('drops emoji, which the fonts lack, and the parentheses around them', () => {
    expect(plainText('TanStack React Query (⭐️)')).toBe('TanStack React Query');
    expect(plainText('Next.js Integration › App Router')).toBe(
      'Next.js Integration › App Router',
    );
  });

  it("drops the backticks around code, and keeps a call's parentheses", () => {
    expect(
      plainText('Packages that extend every procedure with `t.concat()`'),
    ).toBe('Packages that extend every procedure with t.concat()');
  });
});

describe('displayUrl', () => {
  it('splits the host from the path', () => {
    expect(displayUrl('https://trpc.io/docs/server/procedures')).toEqual({
      host: 'trpc.io',
      path: '/docs/server/procedures',
    });
    expect(displayUrl('https://trpc.io')).toEqual({
      host: 'trpc.io',
      path: '',
    });
  });
});
