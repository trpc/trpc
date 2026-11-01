/**
 * `virtual:og-cards`: what each page's social card shows, by the card's path
 * (`ogImagePath`), for `routes/og.$.ts` to render on request.
 */
import type { Plugin } from 'vite';

import type { OgCard } from '../src/og/card.ts';
import { ogImagePath } from '../src/seo.ts';

const moduleId = 'virtual:og-cards';
const resolvedId = `\0${moduleId}`;

/** The module's source: a map from each card's path to the card. */
export const ogCardsSource = (cards: ReadonlyArray<OgCard>) => {
  const byPath = new Map<string, OgCard>();
  for (const card of cards) {
    const path = ogImagePath(card.path);
    if (byPath.has(path)) {
      throw new Error(`Two social cards for ${card.path}`);
    }
    byPath.set(path, card);
  }
  return `export const cards = new Map(${JSON.stringify([...byPath])});\n`;
};

export function ogCards(cards: ReadonlyArray<OgCard>): Plugin {
  const source = ogCardsSource(cards);
  return {
    load: (id) => (id === resolvedId ? source : undefined),
    name: 'trpc-www:og-cards',
    resolveId: (id) => (id === moduleId ? resolvedId : undefined),
  };
}
