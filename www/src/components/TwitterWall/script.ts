/**
 * Script to generate a JSON file of tweets from the Twitter API.
 * Fetches the tweeets from this timeline: https://twitter.com/alexdotjs/timelines/1441435105910796291
 *
 * Script has shitty typesafety but hey, it works :)
 */
import 'dotenv/config';
import fs from 'fs';
import OAuth from 'oauth';
import { z } from 'zod';

// Get these keys from dev.twitter.com, create an application and go to 'Keys and tokens'
const env = z
  .object({
    TWITTER_API_KEY: z.string().min(1),
    TWITTER_API_KEY_SECRET: z.string().min(1),
    TWITTER_ACCESS_TOKEN: z.string().min(1),
    TWITTER_ACCESS_TOKEN_SECRET: z.string().min(1),
  })
  .parse(process.env);

const oauth = new OAuth.OAuth(
  'https://api.twitter.com/oauth/request_token',
  'https://api.twitter.com/oauth/access_token',
  env.TWITTER_API_KEY,
  env.TWITTER_API_KEY_SECRET,
  '1.0A',
  null,
  'HMAC-SHA1',
);

/** Formats a date to mmm DD e.g. Jul 27 */
const dateFormatter = new Intl.DateTimeFormat('en-US', {
  month: 'short',
  day: '2-digit',
});

const flattenTweets = (tweets: any, users: any) => {
  return Object.entries(tweets).map(([tweetId, tweetData]: [any, any]) => {
    const date = new Date(tweetData.created_at);
    const userId = tweetData.user.id_str;

    /**
     * Twitter API returns the text with HTML escaped characters
     * so we un-escape these so that they can be rendered properly
     *
     * We also remove the trailing link if the tweet was truncated
     */
    const content = tweetData.text
      .replaceAll(/&amp;/g, '&')
      .replaceAll(/&lt;/g, '<')
      .replaceAll(/&gt;/g, '>')
      .replaceAll(/&quot;/g, '"')
      .replaceAll(/&#39;/g, "'")
      .replace(/\b(http(s|):\/\/.+)\W*$/, '');

    return {
      id: tweetId,
      name: users[userId].name,
      handle: users[userId].screen_name,
      date: dateFormatter.format(date),
      avatar: users[userId].profile_image_url_https,
      content: content,
    };
  });
};

function req(pathname: string): Promise<any> {
  return new Promise((resolve, reject) => {
    oauth.get(
      `https://api.twitter.com${pathname}`,
      env.TWITTER_ACCESS_TOKEN,
      env.TWITTER_ACCESS_TOKEN_SECRET,
      (err, data) => {
        if (err) {
          reject(err);
        }
        try {
          resolve(JSON.parse(data?.toString() as string));
        } catch (err) {
          reject(err);
        }
      },
    );
  });
}
async function main() {
  const json = await req(
    '/1.1/collections/entries.json?id=custom-1441435105910796291',
  );

  const tweets = json?.objects?.tweets;
  const users = json?.objects?.users;

  if (!tweets || !users) {
    throw new Error('An error occurred while fetching the tweet');
  }

  const flattenedTweets = flattenTweets(tweets, users);
  const output = JSON.stringify(flattenedTweets, null, 2);
  const text = [
    `// prettier-ignore`,
    `// eslint-disable`,
    `export const tweets = ${output}`,
    ``,
  ].join('\n');

  fs.writeFileSync(__dirname + '/script.output.ts', text);
}
main().catch((err) => {
  throw err;
});
