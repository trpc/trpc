// Don't judge me on this code
import fs from 'fs';
import { allSponsors } from './script.output';

const sponsors = [...allSponsors].sort((a, b) => b.weight - a.weight);

type Sponsor = (typeof allSponsors)[number];
type ValidLogins = Sponsor['login'];

interface Def {
  diamond: ValidLogins[];
  gold: ValidLogins[];
  silver: ValidLogins[];
  bronze: ValidLogins[];
}

const sections: Def = {
  diamond: [],
  gold: [
    //
    'tryretool',
  ],
  silver: [
    //
    'calcom',
    'coderabbitai',
    'greptileai',
  ],
  bronze: [
    //
    'hidrb',
    'ryanmagoon',
  ],
};

interface Buckets {
  diamond: Sponsor[];
  gold: Sponsor[];
  silver: Sponsor[];
  bronze: Sponsor[];
  other: Sponsor[];
}

const buckets: Buckets = {
  diamond: [],
  gold: [],
  silver: [],
  bronze: [],
  other: [],
};

for (const sponsor of sponsors) {
  const { login } = sponsor;
  const section = sections.diamond.includes(login)
    ? 'diamond'
    : sections.gold.includes(login)
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
  diamond: {
    title: '💎 Diamond Sponsors',
    numCols: 2,
    imgSize: 180,
  },
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
    title: '😻 Smaller Backers',
    numCols: 6,
    imgSize: 100,
  },
};

const markdown: string[] = [];

for (const [k, config] of Object.entries(bucketConfig)) {
  const key = k as keyof Buckets;

  if (buckets[key].length === 0) {
    continue;
  }
  markdown.push(`### ${config.title}`);

  const cols = buckets[key].map((sponsor) => {
    const imgSrc = new URL(sponsor.imgSrc);
    imgSrc.searchParams.set('s', config.imgSize.toString());

    return `<td align="center"><a href="${encodeURI(
      sponsor.link,
    )}"><img src="${encodeURI(imgSrc.toString())}" width="${
      config.imgSize
    }" alt="${encodeURI(sponsor.name)}"/><br />${sponsor.name}</a></td>`;
  });

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
      '\n',
    ].join('\n'),
  );
  fs.writeFileSync(file, newContents);
}
