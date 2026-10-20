import { describe, expect, it } from '@effect/vitest';

import type { PostMeta } from '../src/content/types.ts';
import { site } from '../src/site.ts';
import { atomFeed, rssFeed } from './feeds.ts';

const posts: ReadonlyArray<PostMeta> = [
  {
    authors: [{ name: 'Alex & co', url: 'https://github.com/KATT' }],
    date: '2025-03-21',
    description: 'v11 is out <finally>.',
    readingMinutes: 3,
    slug: 'announcing-trpc-v11',
    title: 'Announcing "tRPC" v11',
  },
  {
    authors: [{ name: 'tRPC' }],
    date: '2022-11-21',
    description: 'v10.',
    readingMinutes: 2,
    slug: 'announcing-trpc-10',
    title: 'Announcing tRPC v10',
  },
];

describe('rssFeed', () => {
  it('lists every post at its trpc.io URL, escaped, with its date and authors', () => {
    const rss = rssFeed(posts);
    expect(rss).toContain(
      `<atom:link href="${site.url}/blog/rss.xml" rel="self" type="application/rss+xml"/>`,
    );
    expect(rss).toContain('<title>Announcing &quot;tRPC&quot; v11</title>');
    expect(rss).toContain(
      '<guid isPermaLink="true">https://trpc.io/blog/announcing-trpc-v11</guid>',
    );
    expect(rss).toContain('<pubDate>Fri, 21 Mar 2025 00:00:00 GMT</pubDate>');
    expect(rss).toContain(
      '<description>v11 is out &lt;finally&gt;.</description>',
    );
    expect(rss).toContain('<dc:creator>Alex &amp; co</dc:creator>');
    expect(rss).toContain(
      '<lastBuildDate>Fri, 21 Mar 2025 00:00:00 GMT</lastBuildDate>',
    );
    expect(rss.indexOf('announcing-trpc-v11')).toBeLessThan(
      rss.indexOf('announcing-trpc-10'),
    );
  });
});

describe('atomFeed', () => {
  it('lists every post, updated as of the newest', () => {
    const atom = atomFeed(posts);
    expect(atom).toContain('<feed xmlns="http://www.w3.org/2005/Atom">');
    expect(atom).toContain('<updated>2025-03-21T00:00:00.000Z</updated>');
    expect(atom).toContain(
      `<link href="${site.url}/blog/atom.xml" rel="self"/>`,
    );
    expect(atom).toContain('<id>https://trpc.io/blog/announcing-trpc-10</id>');
    expect(atom).toContain(
      '<author>\n      <name>Alex &amp; co</name>\n      <uri>https://github.com/KATT</uri>\n    </author>',
    );
    expect(atom).toContain('<author>\n      <name>tRPC</name>\n    </author>');
  });
});
