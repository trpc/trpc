// Don't judge me on this code
import fs from 'fs';
import { sponsors } from './script.output';
import { getMultiplier } from './utils';

type Sponsor = typeof sponsors[number];
type ValidLogins = Sponsor['login'];

interface Def {
  gold: ValidLogins[];
  silver: ValidLogins[];
  bronze: ValidLogins[];
}

const sections: Def = {
  gold: [
    //
    'renderinc',
    'calcom',
  ],
  silver: [
    //
    'JasonDocton',
    'pingdotgg',
    'prisma',
  ],
  bronze: [
    'newfront-insurance',
    'hidrb',
    'chimon2000',
    'snaplet',
    'flylance-apps',
    'echobind',
  ],
};

interface Buckets {
  gold: Sponsor[];
  silver: Sponsor[];
  bronze: Sponsor[];
  other: Sponsor[];
}

const buckets: Buckets = {
  gold: [],
  silver: [],
  bronze: [],
  other: [],
};

const sortedSponsors = sponsors
  .map((sponsor) => {
    return {
      ...sponsor,
      value: getMultiplier(sponsor.createdAt) * sponsor.monthlyPriceInDollars,
    };
  })
  .sort((a, b) => b.value - a.value);

for (const sponsor of sortedSponsors) {
  const { login } = sponsor;
  const section = sections.gold.includes(login)
    ? 'gold'
    : sections.silver.includes(login)
    ? 'silver'
    : sections.bronze.includes(login)
    ? 'bronze'
    : 'other';

  buckets[section].push(sponsor);
}

const bucketConfig: Record<
  keyof Buckets,
  {
    title: string;
    numCols: number;
    imgSize: number;
  }
> = {
  gold: {
    title: '🥇 Gold Sponsors',
    numCols: 3,
    imgSize: 180,
  },
  silver: {
    title: '🥈 Silver Sponsors',
    numCols: 4,
    imgSize: 150,
  },
  bronze: {
    title: '🥉 Bronze Sponsors',
    numCols: 5,
    imgSize: 120,
  },
  other: {
    title: '😻 Individuals',
    numCols: 6,
    imgSize: 100,
  },
};

const markdown: string[] = [];

for (const [k, config] of Object.entries(bucketConfig)) {
  const key = k as keyof Buckets;
  markdown.push(`### ${config.title}`);

  const cols = buckets[key].map(
    (sponsor) =>
      `<td align="center"><a href="${encodeURI(
        sponsor.link,
      )}"><img src="${encodeURI(sponsor.imgSrc)}&s=${config.imgSize}" width="${
        config.imgSize
      }" alt="${encodeURI(sponsor.name)}"/><br />${sponsor.name}</a></td>`,
  );

  const rowsMatrix: string[][] = [[]];
  for (const col of cols) {
    if (rowsMatrix[rowsMatrix.length - 1].length >= config.numCols) {
      rowsMatrix.push([]);
    }
    rowsMatrix[rowsMatrix.length - 1].push(col);
  }

  let table = '<table>';
  for (const row of rowsMatrix) {
    table += '\n  <tr>';
    for (const col of row) {
      table += `\n   ${col}`;
    }
    table += '\n  </tr>';
  }
  table += '\n</table>';

  markdown.push(table);
}

const markdownStr = markdown.join('\n\n');
const rootPath = __dirname + '/../../../..';

const files = [
  `${rootPath}/README.md`,
  `${rootPath}/www/unversioned/_sponsors.mdx`,
];

for (const file of files) {
  const str = fs.readFileSync(file).toString();
  const start = '<!-- SPONSORS:LIST:START -->';
  const end = '<!-- SPONSORS:LIST:END -->';

  if (str.indexOf(start) >= str.indexOf(end)) {
    throw new Error(`Not working for ${file}`);
  }

  const newContents = str.replace(
    str.substring(str.indexOf(start) + start.length, str.lastIndexOf(end)),
    [
      '',
      '<!-- prettier-ignore-start -->',
      '<!-- markdownlint-disable -->',
      '',
      markdownStr,
      '',
      '<!-- markdownlint-restore -->',
      '<!-- prettier-ignore-end -->',
      '',
    ].join('\n'),
  );
  fs.writeFileSync(file, newContents);
}
