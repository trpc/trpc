import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';

import { describe, expect, it } from 'vitest';

import { ogImagePath } from '../seo.ts';
import {
  colors,
  displayUrl,
  docDescription,
  docTitle,
  initials,
  plainText,
  sectionLabel,
  titleSize,
  truncateWords,
} from './card.ts';

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

describe('sectionLabel', () => {
  it('names the part of the site a page is in', () => {
    expect(sectionLabel('/docs')).toBe('Docs');
    expect(sectionLabel('/docs/client/links')).toBe('Docs');
    expect(sectionLabel('/docs/v10/client/react')).toBe('Docs · v10');
    expect(sectionLabel('/docs/v9')).toBe('Docs · v9');
    expect(sectionLabel('/docs/typedoc/server')).toBe('API reference');
    expect(sectionLabel('/blog')).toBe('Blog');
    expect(sectionLabel('/sponsor')).toBe('Sponsor');
    expect(sectionLabel('/')).toBe('tRPC');
  });
});

describe('docTitle', () => {
  it("shortens a long title's trailing type parameters", () => {
    expect(
      docTitle(
        'Interface: TRPCProcedureBuilder<TContext, TMeta, TContextOverrides, TInputIn, TInputOut, TOutputIn, TOutputOut, TCaller, TErrorShape>',
      ),
    ).toBe('Interface: TRPCProcedureBuilder<…>');
    expect(docTitle('Function: initTRPC<TContext>')).toBe(
      'Function: initTRPC<TContext>',
    );
  });
});

describe('docDescription', () => {
  it("uses the site's subtitle for a page without a description of its own", () => {
    expect(docDescription({ description: '', title: 'tRPC' })).toBe(
      'End-to-end typesafe APIs made easy.',
    );
    expect(
      docDescription({
        description: 'React Query Integration',
        title: 'React Query Integration',
      }),
    ).toBe('End-to-end typesafe APIs made easy.');
    expect(
      docDescription({ description: 'Links in `tRPC`', title: 'Links' }),
    ).toBe('Links in tRPC');
  });
});

describe('titleSize', () => {
  it('gets smaller as a title gets longer', () => {
    expect(titleSize('Links', 72)).toBe(72);
    expect(
      titleSize('Introducing the new TanStack React Query integration', 72),
    ).toBe(64);
    expect(titleSize('x'.repeat(80), 72)).toBe(52);
  });
});

describe('initials', () => {
  it("takes the first two words' first letters, past emoji and slashes", () => {
    expect(initials('Alex / KATT 🐱')).toBe('AK');
    expect(initials('Julius Marminge')).toBe('JM');
    expect(initials('sachinraja')).toBe('S');
  });
});

describe('colors', () => {
  const tokens: Record<keyof typeof colors, string> = {
    background: '--background',
    border: '--border',
    brand: '--brand',
    foreground: '--foreground',
    link: '--brand-dark',
    mutedForeground: '--muted-foreground',
  };

  it("are the site's light theme", () => {
    const theme = readFileSync(
      createRequire(import.meta.url).resolve('@shared/ui/theme.css'),
      'utf8',
    );
    for (const [key, token] of Object.entries(tokens)) {
      const light = new RegExp(
        `${token}:\\s*(?:light-dark\\(\\s*)?(#[0-9a-f]{6})`,
      ).exec(theme)?.[1];
      expect(light, token).toBe(colors[key as keyof typeof colors]);
    }
  });
});
