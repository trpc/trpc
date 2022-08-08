import fs from 'fs';
import fetch from 'node-fetch';

/**
 * Script to generate a JSON file of tweets from the Twitter API.
 * Fetches the tweeets from this timeline: https://twitter.com/alexdotjs/timelines/1441435105910796291
 *
 * Script has shitty typesafety but hey, it works :)
 */

const {
  OAUTH_CONSUMER_KEY,
  OAUTH_NONCE,
  OAUTH_SIGNATURE,
  OAUTH_TIMESTAMP,
  OAUTH_TOKEN,
} = process.env;

const url =
  'https://api.twitter.com/1.1/collections/entries.json?id=custom-1441435105910796291';
const options = {
  headers: {
    accept: '*/*',
    Authorization: `OAuth oauth_consumer_key="${OAUTH_CONSUMER_KEY}", oauth_nonce="${OAUTH_NONCE}", oauth_signature="${OAUTH_SIGNATURE}", oauth_signature_method="HMAC-SHA1", oauth_timestamp="${OAUTH_TIMESTAMP}", oauth_token="${OAUTH_TOKEN}", oauth_version="1.0"`,
  },
};

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

type Tweets = ReturnType<typeof flattenTweets>;

/** Take the flattened array and group into subarrays */
const columnify = (tweets: Tweets, columns = 3) => {
  const cols = [];
  for (let i = 0; i < tweets.length; i += columns) {
    cols.push(tweets.slice(i, i + columns));
  }
  return cols;
};

const main = async () => {
  const {
    objects: { tweets, users },
  } = await (await fetch(url, options)).json();

  const flattenedTweets = flattenTweets(tweets, users);

  const columnifiedTweets = columnify(flattenedTweets);

  const json = JSON.stringify(columnifiedTweets, null, 2);
  const text = `export const tweets = ${json}`;

  fs.writeFileSync(__dirname + '/script.output.ts', text);
};

void main();
