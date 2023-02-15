import { graphql } from '@octokit/graphql';
import fs from 'fs';
import { Node, SponsorEsque } from './script.types';

const { TRPC_GITHUB_TOKEN } = process.env;
if (!TRPC_GITHUB_TOKEN) {
  throw new Error('TRPC_GITHUB_TOKEN is not set');
}

const graphqlWithAuth = graphql.defaults({
  headers: {
    authorization: `token ${TRPC_GITHUB_TOKEN}`,
  },
});

function ensureHttpAndAddRef(urlStr: string) {
  const httpUrlStr = urlStr.startsWith('http') ? urlStr : `http://${urlStr}`;
  const url = new URL(httpUrlStr);
  if (!url.searchParams.has('ref')) {
    url.searchParams.set('ref', 'trpc');
  }
  return url.toString();
}

function flattenSponsor(node: Node) {
  const link = node.sponsorEntity.websiteUrl
    ? ensureHttpAndAddRef(node.sponsorEntity.websiteUrl)
    : `https://github.com/${node.sponsorEntity.login}`;
  return {
    __typename: node.sponsorEntity.__typename,
    name: node.sponsorEntity.name || node.sponsorEntity.login,
    imgSrc: node.sponsorEntity.avatarUrl,
    monthlyPriceInDollars: node.tier.monthlyPriceInDollars,
    link,
    privacyLevel: node.privacyLevel,
    login: node.sponsorEntity.login,
    createdAt: Date.parse(node.createdAt),
  };
}
async function getViewerGithubSponsors() {
  let sponsors: ReturnType<typeof flattenSponsor>[] = [];

  const fetchPage = async (cursor = '') => {
    const res: {
      viewer: SponsorEsque;
    } = await graphqlWithAuth(
      `
      query ($cursor: String) {
        viewer {
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

async function main() {
  const sponsors = await Promise.all([
    getViewerGithubSponsors(),
    getOrgGithubSponsors(),
  ]).then((parts) =>
    parts
      .flat()
      .filter((it) => it.privacyLevel === 'PUBLIC')
      .sort((a, b) => a.createdAt - b.createdAt),
  );

  const json = JSON.stringify(sponsors, null, 2);

  const text = [
    '// prettier-ignore',
    '// eslint-disable',
    '',
    `export const sponsors = ${json} as const`,
    '',
  ].join('\n');

  fs.writeFileSync(__dirname + '/script.raw.ts', text);
}

void main();
