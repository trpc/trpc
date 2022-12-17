import { graphql } from '@octokit/graphql';
import fs from 'fs';
import { Node, RootObject } from './script.types';

const { TRPC_GITHUB_TOKEN } = process.env;
if (!TRPC_GITHUB_TOKEN) {
  throw new Error('TRPC_GITHUB_TOKEN is not set');
}

const graphqlWithAuth = graphql.defaults({
  headers: {
    authorization: `token ${TRPC_GITHUB_TOKEN}`,
  },
});

function ensureHttp(url: string) {
  if (url.startsWith('http')) {
    return url;
  }
  return `https://${url}`;
}

function flattenSponsor(node: Node) {
  const link = node.sponsorEntity.websiteUrl
    ? ensureHttp(node.sponsorEntity.websiteUrl)
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
async function getGithubSponsors() {
  let sponsors: ReturnType<typeof flattenSponsor>[] = [];

  const fetchPage = async (cursor = '') => {
    const res: RootObject = await graphqlWithAuth(
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

    fs.writeFileSync(__dirname + '/script.raw.json', JSON.stringify(res));
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

  return sponsors
    .filter((it) => it.privacyLevel === 'PUBLIC')
    .sort((a, b) => a.createdAt - b.createdAt);
}

async function main() {
  const sponsors = await getGithubSponsors();

  const json = JSON.stringify(sponsors, null, 2);

  const text = [
    '// prettier-ignore',
    '// eslint-disable',
    '',
    `export const sponsors = ${json} as const`,
    '',
  ].join('\n');

  fs.writeFileSync(__dirname + '/script.output.ts', text);
}

void main();
