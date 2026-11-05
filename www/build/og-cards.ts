/**
 * `virtual:og-cards`: what each page's social card shows, by the card's path
 * (`ogImagePath`), for `routes/og.$.ts` to render on request. It also sets
 * `import.meta.env.OG_CARDS_VERSION` (`ogImageUrl`).
 */
import { createHash } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';

import type { Plugin } from 'vite';

import type { OgCard } from '../src/og/card.ts';
import { sponsorCloudPath } from '../src/og/sponsor-cloud.ts';
import { ogImagePath } from '../src/seo.ts';
import { site } from '../src/site.ts';
import { cardFooter } from '../src/sponsors.ts';

const moduleId = 'virtual:og-cards';
const resolvedId = `\0${moduleId}`;

/** The module's source: a map from each card's path to the card. */
export const ogCardsSource = (cards: ReadonlyArray<OgCard>) => {
  const byPath = new Map<string, OgCard>();
  for (const card of cards) {
    const path = ogImagePath(card.path);
    if (path === sponsorCloudPath) {
      throw new Error(`${card.path}'s social card would be the sponsor cloud`);
    }
    if (byPath.has(path)) {
      throw new Error(`Two social cards for ${card.path}`);
    }
    byPath.set(path, card);
  }
  return `export const cards = new Map(${JSON.stringify([...byPath])});\n`;
};

const ogDir = new URL('../src/og/', import.meta.url);

/** The packages that lay out, rasterize and letter the cards. */
const rendererPackages = ['satori', '@resvg/resvg-wasm', '@fontsource/inter'];

/**
 * What the cards are drawn with: `src/og`'s modules, the wordmark, and
 * `rendererPackages`' `package.json`s, whose versions change with an upgrade.
 */
const rendererFiles = () => [
  ...readdirSync(ogDir)
    .filter((name) => name.endsWith('.ts') && !name.endsWith('.test.ts'))
    .toSorted()
    .map((name) => new URL(name, ogDir)),
  new URL('../public/img/logo-text-black.svg', import.meta.url),
  ...rendererPackages.map(
    (name) => new URL(`../node_modules/${name}/package.json`, import.meta.url),
  ),
];

/**
 * A short hash of what the cards draw but the live numbers and avatar
 * pictures: every card, the sponsors along their foot, the site's name and
 * tagline, and the renderer (`rendererFiles`).
 * Social sites keep a card by its URL for days, so `ogImageUrl` puts this
 * in it, and a card that changes gets a new URL; a deploy that changes no
 * card keeps the old one.
 */
export const ogCardsVersion = (cards: ReadonlyArray<OgCard>) => {
  const hash = createHash('sha256')
    .update(ogCardsSource(cards))
    .update(JSON.stringify(cardFooter))
    .update(JSON.stringify(site));
  for (const file of rendererFiles()) {
    hash.update(readFileSync(file));
  }
  return hash.digest('hex').slice(0, 10);
};

export function ogCards(cards: ReadonlyArray<OgCard>): Plugin {
  const source = ogCardsSource(cards);
  return {
    config: () => ({
      define: {
        'import.meta.env.OG_CARDS_VERSION': JSON.stringify(
          ogCardsVersion(cards),
        ),
      },
    }),
    load: (id) => (id === resolvedId ? source : undefined),
    name: 'trpc-www:og-cards',
    resolveId: (id) => (id === moduleId ? resolvedId : undefined),
  };
}
