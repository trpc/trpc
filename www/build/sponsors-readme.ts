/**
 * The sponsors section of a README, between its `SPONSORS:LIST` markers:
 * the sponsor cloud as a picture linking to the cloud on `/sponsor`
 * (`src/og/sponsor-cloud.ts`), then a table per tier (`sponsorTiers` in
 * `src/sponsors.ts`), by rank, avatars smaller down the tiers, then
 * everyone else as backers, by who has given the most. A small sponsor
 * whose avatar didn't load is left out. Every URL is absolute, so the
 * packages' READMEs draw it on npm too.
 */
import {
  sponsorCloudDisplayWidth,
  sponsorCloudUrl,
} from '../src/og/sponsor-cloud.ts';
import { site } from '../src/site.ts';
import {
  avatarUrl,
  partnerTiers,
  type Sponsor,
  type SponsorTier,
  sponsorPage,
  sponsorTiers,
} from '../src/sponsors.ts';

export const startMarker = '<!-- SPONSORS:LIST:START -->';
export const endMarker = '<!-- SPONSORS:LIST:END -->';

interface Tier {
  readonly columns: number;
  /** The avatars' width in CSS pixels; they're fetched at twice that. */
  readonly size: number;
  readonly title: string;
}

const tierTables: Record<SponsorTier, Omit<Tier, 'title'>> = {
  bronze: { columns: 4, size: 120 },
  gold: { columns: 3, size: 180 },
  silver: { columns: 3, size: 150 },
};
const backersTier: Tier = { columns: 6, size: 100, title: 'Backers' };

function escapeHtml(text: string) {
  return text
    .replaceAll('&', '&amp;')
    .replaceAll('"', '&quot;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;');
}

function cell(sponsor: Sponsor, size: number) {
  const name = escapeHtml(sponsor.name);
  const src = escapeHtml(avatarUrl(sponsor, size * 2));
  return `<td align="center"><a href="${escapeHtml(sponsor.link)}"><img src="${src}" width="${size}" alt="${name}"/><br />${name}</a></td>`;
}

function table(sponsors: ReadonlyArray<Sponsor>, tier: Tier) {
  const rows: Array<string> = [];
  for (let start = 0; start < sponsors.length; start += tier.columns) {
    const cells = sponsors
      .slice(start, start + tier.columns)
      .map((sponsor) => `   ${cell(sponsor, tier.size)}`);
    rows.push(['  <tr>', ...cells, '  </tr>'].join('\n'));
  }
  return [`### ${tier.title}`, '', '<table>', ...rows, '</table>'].join('\n');
}

/**
 * The sponsor cloud's picture at `cloudVersion` (`sponsorCloudVersion` in
 * `og-cards.ts`), centered, linking to the cloud on `/sponsor`.
 */
export function sponsorCloudMarkdown(cloudVersion: string) {
  const href = `${site.url}${sponsorPage.path}#${sponsorPage.cloudId}`;
  const src = escapeHtml(sponsorCloudUrl(cloudVersion));
  return [
    '<p align="center">',
    `  <a href="${href}"><img src="${src}" width="${sponsorCloudDisplayWidth}" alt="${site.name}'s sponsors, each drawn bigger the more they've given"/></a>`,
    '</p>',
  ].join('\n');
}

/**
 * The cloud, at `cloudVersion`, and the tiers' Markdown (HTML tables, which
 * GitHub renders with avatars).
 */
export function sponsorsMarkdown(
  sponsors: ReadonlyArray<Sponsor>,
  cloudVersion: string,
) {
  const byWeight = sponsors
    .filter((sponsor) => sponsor.imageless !== true)
    .toSorted((a, b) => b.weight - a.weight || a.createdAt - b.createdAt);
  const byRank = byWeight.toSorted(
    (a, b) =>
      (a.rank ?? Number.POSITIVE_INFINITY) -
      (b.rank ?? Number.POSITIVE_INFINITY),
  );
  const tiers = [
    ...sponsorTiers.map((entry) => ({
      sponsors: byRank.filter((sponsor) => sponsor.tier === entry.tier),
      tier: {
        ...tierTables[entry.tier],
        title: `${entry.label} ${partnerTiers.includes(entry.tier) ? 'partners' : 'sponsors'}`,
      },
    })),
    {
      sponsors: byWeight.filter((sponsor) => sponsor.tier === undefined),
      tier: backersTier,
    },
  ];
  return [
    ...(byWeight.length === 0 ? [] : [sponsorCloudMarkdown(cloudVersion)]),
    ...tiers
      .filter((entry) => entry.sponsors.length > 0)
      .map((entry) => table(entry.sponsors, entry.tier)),
  ].join('\n\n');
}

/**
 * `readme` with `markdown` between its markers, or `undefined` when it
 * doesn't have a start marker followed by an end marker.
 */
export function withSponsorsBlock(readme: string, markdown: string) {
  const start = readme.indexOf(startMarker);
  const end = readme.indexOf(endMarker, start + startMarker.length);
  if (start === -1 || end === -1) {
    return undefined;
  }
  return [
    readme.slice(0, start + startMarker.length),
    '<!-- oxfmt-ignore-start -->',
    '<!-- markdownlint-disable -->',
    '',
    markdown,
    '',
    '<!-- markdownlint-restore -->',
    '<!-- oxfmt-ignore-end -->',
    '',
    readme.slice(end),
  ].join('\n');
}
