import type XTwitterScraper from 'x-twitter-scraper';

export interface TestimonialTweet {
  author: {
    name: string;
    profilePicture: string;
    username: string;
  };
  createdAt: string;
  id: string;
  likeCount: number;
  text: string;
  url: string;
}

const knownGithubProfiles: Readonly<Record<string, string>> = {
  theo: 't3dotgg',
};

const asString = (value: unknown): string | undefined =>
  typeof value === 'string' && value.length > 0 ? value : undefined;

const isXUrl = (value: string): boolean =>
  /^(?:https?:\/\/)?(?:www\.)?(?:pic\.)?(?:twitter\.com|x\.com)\//i.test(value);

const formatText = (
  text: string,
  entities: XTwitterScraper.SearchTweet['entities'],
): string => {
  const urls = Array.isArray(entities?.urls) ? entities.urls : [];
  let formatted = text;

  for (const value of urls) {
    if (!value || typeof value !== 'object') {
      continue;
    }

    const entity = value as Record<string, unknown>;
    const source = asString(entity.url);
    const display =
      asString(entity.display_url) ??
      asString(entity.displayUrl) ??
      asString(entity.expanded_url) ??
      asString(entity.expandedUrl);

    if (source && display) {
      formatted = formatted.replaceAll(source, isXUrl(display) ? '' : display);
    }
  }

  return formatted
    .replaceAll('&amp;', '&')
    .replaceAll('&lt;', '<')
    .replaceAll('&gt;', '>')
    .replaceAll('&quot;', '"')
    .replaceAll('&#39;', "'")
    .trim();
};

const normalizeTweet = (
  tweet: XTwitterScraper.SearchTweet,
): TestimonialTweet => {
  const { author, createdAt } = tweet;

  if (!author) {
    throw new Error(`Tweet ${tweet.id} has no author.`);
  }
  if (!createdAt || Number.isNaN(Date.parse(createdAt))) {
    throw new Error(`Tweet ${tweet.id} has no valid creation date.`);
  }

  const githubProfile = knownGithubProfiles[author.username];
  const profilePicture = githubProfile
    ? `https://github.com/${githubProfile}.png`
    : author.profilePicture;

  if (!profilePicture) {
    throw new Error(`Tweet ${tweet.id} author has no profile picture.`);
  }
  if (!Number.isSafeInteger(tweet.likeCount) || tweet.likeCount < 0) {
    throw new Error(`Tweet ${tweet.id} has no valid like count.`);
  }

  return {
    author: {
      name: author.name,
      profilePicture,
      username: author.username,
    },
    createdAt: new Date(createdAt).toISOString(),
    id: tweet.id,
    likeCount: tweet.likeCount,
    text: formatText(tweet.text, tweet.entities),
    url: `https://x.com/${author.username}/status/${tweet.id}`,
  };
};

export const prepareTweets = (
  tweets: readonly XTwitterScraper.SearchTweet[],
  curatedIds: readonly string[],
): TestimonialTweet[] => {
  const uniqueIds = new Set(curatedIds);
  if (uniqueIds.size !== curatedIds.length) {
    throw new Error('The curated testimonial list contains duplicate IDs.');
  }

  const tweetsById = new Map(tweets.map((tweet) => [tweet.id, tweet]));
  if (tweetsById.size !== tweets.length) {
    throw new Error('The tweet response contains duplicate IDs.');
  }

  const unexpectedIds = tweets
    .filter((tweet) => !uniqueIds.has(tweet.id))
    .map((tweet) => tweet.id);
  if (unexpectedIds.length > 0) {
    throw new Error(
      `The tweet response contains unexpected IDs: ${unexpectedIds.join(', ')}`,
    );
  }

  return curatedIds.map((id) => {
    const tweet = tweetsById.get(id);
    if (!tweet) {
      throw new Error(`The tweet response is missing curated ID ${id}.`);
    }
    return normalizeTweet(tweet);
  });
};
