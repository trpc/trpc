import { describe, expect, it } from 'vitest';
import type XTwitterScraper from 'x-twitter-scraper';
import { prepareTweets } from './data';

const tweet = (
  id: string,
  overrides: Partial<XTwitterScraper.SearchTweet> = {},
): XTwitterScraper.SearchTweet => ({
  author: {
    id: `author-${id}`,
    name: `Author ${id}`,
    profilePicture: `https://example.com/${id}.png`,
    username: `author${id}`,
  },
  bookmarkCount: 0,
  createdAt: '2026-08-20T12:00:00Z',
  id,
  likeCount: 10,
  quoteCount: 0,
  replyCount: 0,
  retweetCount: 0,
  text: `Tweet ${id}`,
  viewCount: 0,
  ...overrides,
});

describe('prepareTweets', () => {
  it('preserves curation order and creates stable website data', () => {
    const result = prepareTweets([tweet('2'), tweet('1')], ['1', '2']);

    expect(result.map(({ id }) => id)).toEqual(['1', '2']);
    expect(result[0]).toEqual({
      author: {
        name: 'Author 1',
        profilePicture: 'https://example.com/1.png',
        username: 'author1',
      },
      createdAt: '2026-08-20T12:00:00.000Z',
      id: '1',
      likeCount: 10,
      text: 'Tweet 1',
      url: 'https://x.com/author1/status/1',
    });
  });

  it('expands external links and removes X media links', () => {
    const result = prepareTweets(
      [
        tweet('1', {
          entities: {
            urls: [
              {
                display_url: 'example.com/docs',
                url: 'https://t.co/docs',
              },
              {
                displayUrl: 'pic.x.com/media',
                url: 'https://t.co/media',
              },
            ],
          },
          text: 'Docs &amp; examples &amp;lt;safe&amp;gt; https://t.co/docs https://t.co/media',
        }),
      ],
      ['1'],
    );

    expect(result[0]?.text).toBe(
      'Docs & examples &lt;safe&gt; example.com/docs',
    );
  });

  it('uses the maintained GitHub profile image for Theo', () => {
    const result = prepareTweets(
      [
        tweet('1', {
          author: {
            id: 'theo',
            name: 'Theo',
            username: 'theo',
          },
        }),
      ],
      ['1'],
    );

    expect(result[0]?.author.profilePicture).toBe(
      'https://github.com/t3dotgg.png',
    );
  });

  it('rejects incomplete or mismatched responses', () => {
    expect(() => prepareTweets([tweet('1')], ['1', '2'])).toThrow(
      'missing curated ID 2',
    );
    expect(() => prepareTweets([tweet('2')], ['1'])).toThrow(
      'unexpected IDs: 2',
    );
    expect(() =>
      prepareTweets([tweet('1', { author: undefined })], ['1']),
    ).toThrow('Tweet 1 has no author');
    expect(() =>
      prepareTweets([tweet('1', { createdAt: 'not-a-date' })], ['1']),
    ).toThrow('Tweet 1 has no valid creation date');
    expect(() =>
      prepareTweets([tweet('1', { likeCount: Number.NaN })], ['1']),
    ).toThrow('Tweet 1 has no valid like count');
    expect(() =>
      prepareTweets(
        [tweet('1', { author: { id: '1', name: ' ', username: ' ' } })],
        ['1'],
      ),
    ).toThrow('Tweet 1 author has no valid name or username');
    expect(() =>
      prepareTweets(
        [
          tweet('1', {
            author: {
              id: '1',
              name: 'Author',
              profilePicture: ' ',
              username: 'author',
            },
          }),
        ],
        ['1'],
      ),
    ).toThrow('Tweet 1 author has no profile picture');
    expect(() => prepareTweets([tweet('1', { text: ' ' })], ['1'])).toThrow(
      'Tweet 1 has no testimonial text',
    );
  });

  it('rejects duplicate curated and response IDs', () => {
    expect(() => prepareTweets([tweet('1')], ['1', '1'])).toThrow(
      'curated testimonial list contains duplicate IDs',
    );
    expect(() => prepareTweets([tweet('1'), tweet('1')], ['1'])).toThrow(
      'tweet response contains duplicate IDs',
    );
  });
});
