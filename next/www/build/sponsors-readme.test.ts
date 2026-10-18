import { describe, expect, it } from '@effect/vitest';

import type { Sponsor } from '../src/sponsors.ts';
import {
  endMarker,
  sponsorsMarkdown,
  startMarker,
  withSponsorsBlock,
} from './sponsors-readme.ts';

function sponsor(login: string, weight: number, createdAt = 0): Sponsor {
  return {
    createdAt,
    imgSrc: `https://avatars.githubusercontent.com/u/${login}?v=4`,
    link: `https://${login}.dev/?ref=trpc&utm_source=github`,
    login,
    name: login,
    weight,
  };
}

describe('sponsorsMarkdown', () => {
  it('puts the partners first, then everyone else, each by who gave the most', () => {
    expect(
      sponsorsMarkdown({
        partners: ['p1', 'p2'],
        sponsors: [
          sponsor('b1', 3),
          sponsor('p1', 50),
          sponsor('b2', 9),
          sponsor('p2', 100),
        ],
      }),
    ).toBe(
      [
        '### Partners',
        '',
        '<table>',
        '  <tr>',
        '   <td align="center"><a href="https://p2.dev/?ref=trpc&amp;utm_source=github"><img src="https://avatars.githubusercontent.com/u/p2?v=4&amp;s=300" width="150" alt="p2"/><br />p2</a></td>',
        '   <td align="center"><a href="https://p1.dev/?ref=trpc&amp;utm_source=github"><img src="https://avatars.githubusercontent.com/u/p1?v=4&amp;s=300" width="150" alt="p1"/><br />p1</a></td>',
        '  </tr>',
        '</table>',
        '',
        '### Backers',
        '',
        '<table>',
        '  <tr>',
        '   <td align="center"><a href="https://b2.dev/?ref=trpc&amp;utm_source=github"><img src="https://avatars.githubusercontent.com/u/b2?v=4&amp;s=200" width="100" alt="b2"/><br />b2</a></td>',
        '   <td align="center"><a href="https://b1.dev/?ref=trpc&amp;utm_source=github"><img src="https://avatars.githubusercontent.com/u/b1?v=4&amp;s=200" width="100" alt="b1"/><br />b1</a></td>',
        '  </tr>',
        '</table>',
      ].join('\n'),
    );
  });

  it('breaks a tier into rows, and orders equal weights by who started first', () => {
    const markdown = sponsorsMarkdown({
      partners: [],
      sponsors: Array.from({ length: 8 }, (_, i) => sponsor(`s${i}`, 1, 8 - i)),
    });
    expect(markdown.match(/<tr>/g)).toHaveLength(2);
    expect(markdown.match(/alt="s\d"/g)).toEqual([
      'alt="s7"',
      'alt="s6"',
      'alt="s5"',
      'alt="s4"',
      'alt="s3"',
      'alt="s2"',
      'alt="s1"',
      'alt="s0"',
    ]);
    expect(markdown).not.toContain('### Partners');
  });

  it('escapes names and links as HTML', () => {
    const markdown = sponsorsMarkdown({
      partners: [],
      sponsors: [
        {
          ...sponsor('x', 1),
          link: 'https://x.dev/?a="b"',
          name: 'Dr. <B> & "Co"',
        },
      ],
    });
    expect(markdown).toContain('href="https://x.dev/?a=&quot;b&quot;"');
    expect(markdown).toContain(
      'alt="Dr. &lt;B&gt; &amp; &quot;Co&quot;"/><br />Dr. &lt;B&gt; &amp; &quot;Co&quot;</a>',
    );
  });
});

describe('withSponsorsBlock', () => {
  const readme = [
    '## Sponsors',
    '',
    startMarker,
    'old list',
    endMarker,
    '',
    '## Contributors',
    '',
  ].join('\n');

  it('replaces what is between the markers, keeping the rest', () => {
    expect(withSponsorsBlock(readme, '### Backers')).toBe(
      [
        '## Sponsors',
        '',
        startMarker,
        '<!-- prettier-ignore-start -->',
        '<!-- markdownlint-disable -->',
        '',
        '### Backers',
        '',
        '<!-- markdownlint-restore -->',
        '<!-- prettier-ignore-end -->',
        '',
        endMarker,
        '',
        '## Contributors',
        '',
      ].join('\n'),
    );
  });

  it('writes the same README when run again', () => {
    const once = withSponsorsBlock(readme, '### Backers') ?? '';
    expect(withSponsorsBlock(once, '### Backers')).toBe(once);
  });

  it('is undefined without a start marker followed by an end marker', () => {
    expect(withSponsorsBlock('# No markers', 'x')).toBeUndefined();
    expect(withSponsorsBlock(`${startMarker}\n`, 'x')).toBeUndefined();
    expect(
      withSponsorsBlock(`${endMarker}\n${startMarker}\n`, 'x'),
    ).toBeUndefined();
  });
});
