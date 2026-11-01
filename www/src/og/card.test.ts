import { describe, expect, it } from 'vitest';

import { ogImagePath } from '../seo.ts';
import { displayUrl, initials, plainText, truncateWords } from './card.ts';

describe('ogImagePath', () => {
  it('mirrors the page path under /og', () => {
    expect(ogImagePath('/')).toBe('/og/index.png');
    expect(ogImagePath('/docs/v10/client/links')).toBe(
      '/og/docs/v10/client/links.png',
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
  it('shows the host and the path', () => {
    expect(displayUrl('https://trpc.io/docs/server/procedures')).toBe(
      'trpc.io/docs/server/procedures',
    );
    expect(displayUrl('https://trpc.io')).toBe('trpc.io');
  });
});

describe('truncateWords', () => {
  it('cuts at the last word that fits, as the old cards did', () => {
    expect(truncateWords('Writing a tiny tRPC client', 70)).toBe(
      'Writing a tiny tRPC client',
    );
    expect(truncateWords('Ever wondered how tRPC works?', 20)).toBe(
      'Ever wondered how …',
    );
  });
});

describe('initials', () => {
  it("takes the first two words' first letters, past emoji and slashes", () => {
    expect(initials('Alex / KATT 🐱')).toBe('AK');
    expect(initials('Julius Marminge')).toBe('JM');
    expect(initials('sachinraja')).toBe('S');
  });
});
