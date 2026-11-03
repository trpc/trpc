import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';

import { describe, expect, it } from 'vitest';

import { ogImagePath } from '../seo.ts';
import { partners } from '../sponsors.ts';
import {
  colors,
  displayUrl,
  docDescription,
  docTitle,
  drawnBackers,
  footerLayout,
  footerNameSizes,
  initials,
  partnerName,
  partnerNameEms,
  partnerNameSizes,
  partnerRowLayout,
  plainText,
  type SponsorCard,
  sectionLabel,
  textWidth,
  titleSize,
  truncateWords,
} from './card.ts';

describe('drawnBackers', () => {
  const card: SponsorCard = {
    backerSlots: 2,
    backers: [
      { image: 'big', name: 'Big', partner: true },
      { image: 'gone', name: 'Gone' },
      { image: 'a', name: 'A' },
      { image: 'b', name: 'B' },
    ],
    description: '',
    kind: 'sponsor',
    partners: [],
    path: '/sponsor',
    sponsorCount: 4,
    title: 'Sponsor',
    url: 'https://github.com/sponsors/trpc',
  };
  const loaded = (...images: ReadonlyArray<string>) => ({
    avatars: new Map(images.map((image) => [image, 'data:'])),
    stats: {},
  });

  it("keeps a partner without an avatar, and leaves out a small sponsor's", () => {
    expect(drawnBackers(card, loaded('a', 'b')).map((b) => b.name)).toEqual([
      'Big',
      'A',
    ]);
  });

  it('fills the slots with the next small sponsors whose avatars loaded', () => {
    expect(
      drawnBackers({ ...card, backers: card.backers.slice(1) }, loaded('b')),
    ).toEqual([{ image: 'b', name: 'B' }]);
  });
});

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

describe('textWidth', () => {
  // Inter ExtraBold's own widths, in ems, from its font file.
  const inter = {
    CodeRabbit: 5.79,
    Greptile: 3.96,
    'Liminity AB': 5.63,
    SerpApi: 4.01,
    'Some Company Name GmbH & Co. KG': 18.68,
    WWW: 3.18,
    iii: 0.85,
  };

  it('errs wide, but not by much', () => {
    for (const [text, ems] of Object.entries(inter)) {
      expect(textWidth(text, 10)).toBeGreaterThanOrEqual(ems * 10);
      expect(textWidth(text, 10)).toBeLessThan(ems * 10 * 1.3);
    }
  });

  it('counts a character outside Latin as the widest', () => {
    expect(textWidth('é', 1)).toBe(textWidth('W', 1));
  });
});

describe('partnerName', () => {
  it("draws every one of sponsors.json's partners' names whole", () => {
    expect(partners.length).toBeGreaterThan(0);
    for (const partner of partners) {
      expect(partnerName(partner.name)).toBe(partner.name);
    }
  });

  it('cuts a longer name at the last character that fits, with …', () => {
    expect(partnerName('Northwind Traders')).toBe('Northwind Traders');
    expect(partnerName('Some Company Name GmbH & Co. KG')).toBe(
      'Some Company N…',
    );
    expect(partnerName('Wonderfully Long Partner Name')).toBe(
      'Wonderfully Long…',
    );
    for (const name of ['Some Company Name GmbH & Co. KG', 'W'.repeat(40)]) {
      expect(textWidth(partnerName(name), 1)).toBeLessThanOrEqual(
        partnerNameEms,
      );
    }
  });
});

describe('footerLayout', () => {
  const today = ['CodeRabbit', 'Greptile', 'SerpApi'];

  it("draws today's partners at the largest size, with a dozen faces", () => {
    expect(footerLayout(today, 12, 20, 1056)).toEqual({
      faces: 10,
      nameSize: footerNameSizes[0],
      wraps: false,
    });
  });

  it('draws only the faces that loaded', () => {
    expect(footerLayout(today, 2, 20, 1056).faces).toBe(2);
    expect(footerLayout(today, 0, 20, 1056).faces).toBe(0);
  });

  it('makes names that fit in full smaller, not shorter, to leave room for a few faces', () => {
    const long = [...today, 'Proxidize'];
    const layout = footerLayout(long, 12, 20, 1056);
    expect(layout.nameSize).toBeLessThan(footerNameSizes[0]);
    expect(layout.faces).toBeGreaterThanOrEqual(6);
    expect(layout.wraps).toBe(false);
  });

  it('keeps the names as large as fit, and draws the faces that fit, when no size leaves room for a few', () => {
    const layout = footerLayout(
      [...today, 'Some Company Name GmbH & Co. KG'],
      12,
      20,
      1056,
    );
    expect(layout.faces).toBeLessThan(6);
    expect(layout.wraps).toBe(false);
  });

  it('measures a long name as it is cut short', () => {
    expect(
      footerLayout([...today, 'Some Company Name GmbH & Co. KG'], 12, 20, 1056),
    ).toEqual(footerLayout([...today, 'Some Company N…'], 12, 20, 1056));
  });

  it('wraps names that fit on one line at no size, at the smallest, with no faces', () => {
    const many = [
      ...today,
      'Some Company Name GmbH & Co. KG',
      'Wonderfully Long Partner Name',
    ];
    expect(footerLayout(many, 12, 20, 1056)).toEqual({
      faces: 0,
      nameSize: footerNameSizes.at(-1),
      wraps: true,
    });
  });
});

describe('partnerRowLayout', () => {
  const partner = (name: string) => ({ image: name, name, tier: 'Silver' });

  it("draws today's partners at the largest size", () => {
    expect(
      partnerRowLayout(
        ['CodeRabbit', 'Greptile', 'SerpApi'].map(partner),
        1056,
      ),
    ).toEqual({ nameSize: partnerNameSizes[0], wraps: false });
  });

  it('makes a long name smaller to fit on one line', () => {
    const layout = partnerRowLayout(
      ['CodeRabbit', 'Greptile', 'SerpApi', 'A Rather Long Partner Name'].map(
        partner,
      ),
      1056,
    );
    expect(layout.nameSize).toBeLessThan(partnerNameSizes[0]);
    expect(layout.wraps).toBe(false);
  });

  it('cuts a very long name short before it makes the names smaller', () => {
    const names = ['CodeRabbit', 'Greptile', 'SerpApi'];
    expect(
      partnerRowLayout(
        [...names, 'Some Company Name GmbH & Co. KG'].map(partner),
        1056,
      ),
    ).toEqual(
      partnerRowLayout([...names, 'Some Company N…'].map(partner), 1056),
    );
  });

  it('wraps names that fit on one line at no size, at the largest', () => {
    expect(
      partnerRowLayout(
        [
          'CodeRabbit',
          'Some Company Name GmbH & Co. KG',
          'Wonderfully Long Partner Name',
          'A Rather Long Partner Name',
        ].map(partner),
        1056,
      ),
    ).toEqual({ nameSize: partnerNameSizes[0], wraps: true });
  });
});
