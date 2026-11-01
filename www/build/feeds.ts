/**
 * The blog's feeds, at trpc.io's paths, so its subscribers keep theirs:
 * RSS 2.0 at `/blog/rss.xml` and Atom at `/blog/atom.xml`. Each entry is a
 * post's title, summary (its first paragraph), date and authors, linking to
 * its canonical URL on trpc.io's blog.
 */
import type { Plugin } from 'vite';

import type { PostMeta } from '../src/content/types.ts';
import { absoluteUrl, trpcPostUrl } from '../src/seo.ts';
import { blog } from '../src/site.ts';

const escapeXml = (text: string) =>
  text.replaceAll(
    /[<>&'"]/g,
    (char) =>
      ({
        '"': '&quot;',
        '&': '&amp;',
        "'": '&apos;',
        '<': '&lt;',
        '>': '&gt;',
      })[char] ?? char,
  );

/** A post's date, `2025-03-21`, as midnight UTC. */
const published = (post: PostMeta) => new Date(`${post.date}T00:00:00Z`);

/** RSS 2.0 (https://www.rssboard.org/rss-specification), newest post first. */
export function rssFeed(posts: ReadonlyArray<PostMeta>): string {
  const items = posts.map((post) => {
    const url = trpcPostUrl(post.slug);
    return [
      '    <item>',
      `      <title>${escapeXml(post.title)}</title>`,
      `      <link>${escapeXml(url)}</link>`,
      `      <guid isPermaLink="true">${escapeXml(url)}</guid>`,
      `      <pubDate>${published(post).toUTCString()}</pubDate>`,
      `      <description>${escapeXml(post.description)}</description>`,
      ...post.authors.map(
        (author) => `      <dc:creator>${escapeXml(author.name)}</dc:creator>`,
      ),
      '    </item>',
    ].join('\n');
  });
  const latest = posts[0];
  return [
    '<?xml version="1.0" encoding="utf-8"?>',
    '<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom" xmlns:dc="http://purl.org/dc/elements/1.1/">',
    '  <channel>',
    `    <title>${escapeXml(blog.title)}</title>`,
    `    <link>${escapeXml(absoluteUrl('/blog'))}</link>`,
    `    <description>${escapeXml(blog.description)}</description>`,
    '    <language>en</language>',
    ...(latest
      ? [
          `    <lastBuildDate>${published(latest).toUTCString()}</lastBuildDate>`,
        ]
      : []),
    `    <atom:link href="${escapeXml(absoluteUrl(blog.feeds.rss))}" rel="self" type="application/rss+xml"/>`,
    ...items,
    '  </channel>',
    '</rss>',
    '',
  ].join('\n');
}

/** Atom (RFC 4287), newest post first. */
export function atomFeed(posts: ReadonlyArray<PostMeta>): string {
  const entries = posts.map((post) => {
    const url = trpcPostUrl(post.slug);
    return [
      '  <entry>',
      `    <title>${escapeXml(post.title)}</title>`,
      `    <link href="${escapeXml(url)}"/>`,
      `    <id>${escapeXml(url)}</id>`,
      `    <published>${published(post).toISOString()}</published>`,
      `    <updated>${published(post).toISOString()}</updated>`,
      `    <summary>${escapeXml(post.description)}</summary>`,
      ...post.authors.map((author) =>
        [
          '    <author>',
          `      <name>${escapeXml(author.name)}</name>`,
          ...(author.url ? [`      <uri>${escapeXml(author.url)}</uri>`] : []),
          '    </author>',
        ].join('\n'),
      ),
      '  </entry>',
    ].join('\n');
  });
  const latest = posts[0];
  return [
    '<?xml version="1.0" encoding="utf-8"?>',
    '<feed xmlns="http://www.w3.org/2005/Atom">',
    `  <id>${escapeXml(absoluteUrl('/blog'))}</id>`,
    `  <title>${escapeXml(blog.title)}</title>`,
    `  <subtitle>${escapeXml(blog.description)}</subtitle>`,
    `  <updated>${(latest ? published(latest) : new Date(0)).toISOString()}</updated>`,
    `  <link href="${escapeXml(absoluteUrl('/blog'))}"/>`,
    `  <link href="${escapeXml(absoluteUrl(blog.feeds.atom))}" rel="self"/>`,
    `  <icon>${escapeXml(absoluteUrl('/favicon.ico'))}</icon>`,
    ...entries,
    '</feed>',
    '',
  ].join('\n');
}

const contentTypes: Readonly<Record<string, string>> = {
  [blog.feeds.atom]: 'application/atom+xml; charset=utf-8',
  [blog.feeds.rss]: 'application/rss+xml; charset=utf-8',
};

/** Writes the feeds to the client build; the dev server serves them too. */
export function blogFeeds(options: {
  readonly posts: ReadonlyArray<PostMeta>;
}): Plugin {
  const feeds = new Map<string, string>([
    [blog.feeds.atom, atomFeed(options.posts)],
    [blog.feeds.rss, rssFeed(options.posts)],
  ]);
  return {
    configureServer(server) {
      server.middlewares.use((request, response, next) => {
        const pathname = new URL(request.url ?? '/', 'http://localhost')
          .pathname;
        const feed = feeds.get(pathname);
        if (feed === undefined) {
          next();
          return;
        }
        response.setHeader('Content-Type', contentTypes[pathname] ?? '');
        response.end(feed);
      });
    },
    generateBundle() {
      if (this.environment.name !== 'client') {
        return;
      }
      for (const [pathname, source] of feeds) {
        this.emitFile({ fileName: pathname.slice(1), source, type: 'asset' });
      }
    },
    name: 'blog-feeds',
  };
}
