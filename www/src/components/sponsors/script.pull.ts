// This is an awful script, don't judge
import fs from 'fs';
import type { Node, SponsorEsque } from './script.types';

const { TRPC_GITHUB_TOKEN } = process.env;
if (!TRPC_GITHUB_TOKEN) {
  throw new Error('TRPC_GITHUB_TOKEN is not set');
}

const graphqlWithAuthPromise = import('@octokit/graphql').then(({ graphql }) =>
  graphql.defaults({
    headers: {
      authorization: `token ${TRPC_GITHUB_TOKEN}`,
    },
  }),
);

function ensureHttpAndAddRef(urlStr: string) {
  const httpUrlStr = urlStr.startsWith('http') ? urlStr : `http://${urlStr}`;
  const url = new URL(httpUrlStr);
  if (!url.searchParams.has('ref')) {
    url.searchParams.set('ref', 'trpc');
  }
  url.searchParams.set('utm_source', 'github');
  url.searchParams.set('utm_medium', 'referral');
  url.searchParams.set('utm_campaign', 'trpc');
  return url.toString();
}

function flattenSponsor(node: Node) {
  const link = node.sponsorEntity.websiteUrl
    ? ensureHttpAndAddRef(node.sponsorEntity.websiteUrl)
    : `https://github.com/${node.sponsorEntity.login}`;
  return {
    __typename: node.sponsorEntity.__typename,
    name: node.sponsorEntity.name ?? node.sponsorEntity.login,
    imgSrc: node.sponsorEntity.avatarUrl,
    monthlyPriceInDollars: node.tier.monthlyPriceInDollars,
    link,
    privacyLevel: node.privacyLevel,
    login: node.sponsorEntity.login,
    createdAt: Date.parse(node.createdAt),
  };
}

const sponsorEsqueFragment = `
  sponsorshipsAsMaintainer(first: 100, after: $cursor, includePrivate: true) {
    pageInfo {
      hasNextPage
      endCursor
    }
    edges {
      node {
        createdAt
        sponsorEntity {
          __typename
          ... on User {
            id
            name
            login
            websiteUrl
            avatarUrl
          }
          ... on Organization {
            id
            name
            login
            websiteUrl
            avatarUrl
          }
        }
        tier {
          id
          monthlyPriceInDollars
        }
        privacyLevel
      }
    }
  }
`;
async function getViewerGithubSponsors() {
  let sponsors: ReturnType<typeof flattenSponsor>[] = [];
  const graphqlWithAuth = await graphqlWithAuthPromise;

  const fetchPage = async (cursor = '') => {
    const res: {
      viewer: SponsorEsque;
    } = await graphqlWithAuth(
      `
      query ($cursor: String) {
        viewer {
          ${sponsorEsqueFragment}
        }
      }
      `,
      {
        cursor,
      },
    );

    const {
      viewer: {
        sponsorshipsAsMaintainer: {
          pageInfo: { hasNextPage, endCursor },
          edges,
        },
      },
    } = res;

    sponsors = [...sponsors, ...edges.map((edge) => flattenSponsor(edge.node))];

    if (hasNextPage) {
      await fetchPage(endCursor);
    }
  };

  await fetchPage();

  return sponsors;
}

async function getOrgGithubSponsors() {
  let sponsors: ReturnType<typeof flattenSponsor>[] = [];
  const graphqlWithAuth = await graphqlWithAuthPromise;

  const fetchPage = async (cursor = '') => {
    const res: {
      viewer: {
        organization: SponsorEsque;
      };
    } = await graphqlWithAuth(
      `
      query ($cursor: String) {
        viewer {
          organization(login: "trpc") {
            ${sponsorEsqueFragment}
          }
        }
      }
      `,
      {
        cursor,
      },
    );

    const {
      viewer: {
        organization: {
          sponsorshipsAsMaintainer: {
            pageInfo: { hasNextPage, endCursor },
            edges,
          },
        },
      },
    } = res;

    sponsors = [...sponsors, ...edges.map((edge) => flattenSponsor(edge.node))];

    if (hasNextPage) {
      await fetchPage(endCursor);
    }
  };

  await fetchPage();

  return sponsors;
}

const yearlySponsors = [
  //
  // 'flightcontrolhq',
  'ahoylabs',
  'Wyatt-SG',
  'pingdotgg',
  'nihinihi01',
  'newfront-insurance',
];

async function main() {
  const sortedSponsors = await Promise.all([
    getViewerGithubSponsors(),
    getOrgGithubSponsors(),
  ]).then((parts) => {
    const rawList = parts
      .flat()
      .filter((it) => it.privacyLevel === 'PUBLIC')
      // overrides
      .map((sponsor) => {
        switch (sponsor.login) {
          case 'dakshgup':
            return {
              ...sponsor,
              name: 'Greptile',
              imgSrc: 'https://github.com/greptileai.png',
              link: 'https://greptile.com/?utm_source=opensource&utm_medium=github&utm_campaign=trpc',
              login: 'greptileai',
            };
        }
        return sponsor;
      });

    fs.writeFileSync(
      __dirname + '/script.output.raw.json',
      JSON.stringify(rawList, null, 2),
    );

    // add manual sponsors
    // rawList.push({
    //   __typename: 'Organization',
    //   name: 'Tola',
    //   imgSrc: 'https://github.com/tolahq.png',
    //   monthlyPriceInDollars: 1110,
    //   link: 'https://tolahq.com/?ref=trpc',
    //   privacyLevel: 'PUBLIC',
    //   login: 'tolahq',
    //   // 8 months between 1st of sept and 1st of april
    //   createdAt: Date.now() - 8 * 30 * 24 * 60 * 60 * 1000,
    // });
    const list = rawList.map((sponsor) => {
      // calculate total value
      const MONTH_MS = 30 * 24 * 60 * 60 * 1000;
      const YEAR_MS = 12 * MONTH_MS;

      const yearly = yearlySponsors.includes(sponsor.login);
      const cycles = Math.ceil(
        (Date.now() - sponsor.createdAt) / (yearly ? YEAR_MS : MONTH_MS),
      );

      const base = yearly ? 12 : 1;
      const githubComission = sponsor.__typename === 'Organization' ? 0.1 : 0;
      const value =
        base * cycles * sponsor.monthlyPriceInDollars * (1 - githubComission);

      return {
        ...sponsor,
        value,
        weight: 0,
      };
    });

    // Group by login
    const sponsorsByLogin: Record<string, (typeof list)[number]> = {};
    for (const sponsor of list) {
      const existing = sponsorsByLogin[sponsor.login];
      if (existing) {
        sponsorsByLogin[sponsor.login] = {
          ...existing,
          value: existing.value + sponsor.value,
        };
      } else {
        sponsorsByLogin[sponsor.login] = sponsor;
      }
    }
    return Object.values(sponsorsByLogin).sort((a, b) => b.value - a.value);
  });

  const calculateWeight = (sponsors: typeof sortedSponsors) => {
    // this fn is a mess, don't judge
    const min = Math.min(...sponsors.map((sponsors) => sponsors.value));
    const max = Math.max(...sponsors.map((sponsors) => sponsors.value));

    const nGroups = 100;

    const groupDiff = (max - min) / nGroups;

    const groups: (typeof sortedSponsors)[] = [];
    for (const sponsor of sponsors) {
      let pos = 0;
      while (sponsor.value > min + groupDiff * pos) {
        pos++;
      }
      groups[pos] ||= [];
      groups[pos].push({ ...sponsor, weight: pos + 1 });
    }

    return groups
      .flatMap((group) => group.reverse())
      .reverse()
      .map((sponsor) => {
        return {
          name: sponsor.name,
          imgSrc: sponsor.imgSrc,
          weight: sponsor.weight,
          login: sponsor.login,
          link: sponsor.link,
          createdAt: sponsor.createdAt,
          // value: sponsor.value,
        };
      });
  };

  const withWeights = calculateWeight(sortedSponsors);
  const topSponsors = withWeights.slice(0, 5);

  const text = [
    '// eslint-disable',
    '',
    '// prettier-ignore',
    `export const topSponsors = ${JSON.stringify(
      topSponsors,
      null,
      2,
    )} as const;`,
    '',
    '// prettier-ignore',
    `export const allSponsors = ${JSON.stringify(
      withWeights.sort((a, b) => a.createdAt - b.createdAt),
      null,
      2,
    )} as const;`,
    '',
  ].join('\n');

  fs.writeFileSync(__dirname + '/script.output.ts', text);
}

void main();
