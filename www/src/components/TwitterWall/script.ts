import fs from 'fs';
import fetch from 'node-fetch';

/**
 * Script to generate a JSON file of tweets from the Twitter API.
 * Fetches the tweeets from this timeline: https://twitter.com/alexdotjs/timelines/1441435105910796291
 *
 * Script has shitty typesafety but hey, it works :)
 */

const url =
  'https://api.twitter.com/1.1/collections/entries.json?id=custom-1441435105910796291';
const options = {
  headers: {
    accept: '*/*',
    Authorization:
      'OAuth oauth_consumer_key="4aJCALBY6XjEqtenOXezrZ3gd", oauth_nonce="K3eAOJzdFOX6YR6ntRHkcyZkRvyOQHAf", oauth_signature="4jZhFHzKg%2Bt3u%2Bu2S%2FWA0B4WBgM%3D", oauth_signature_method="HMAC-SHA1", oauth_timestamp="1658926579", oauth_token="3557533403-z4skJ8HQxgYSIguXOuhmHyLj918LrB8EdXkVgjo", oauth_version="1.0"',
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

    const content = tweetData.text;

    // this removes the trailing line at the end of the tweet's content
    const contentWithoutTrailingLink = content.replace(
      /\b(http(s|):\/\/.+)\W*$/,
      '',
    );

    return {
      id: tweetId,
      name: users[userId].name,
      handle: users[userId].screen_name,
      date: dateFormatter.format(date),
      avatar: users[userId].profile_image_url_https,
      content: contentWithoutTrailingLink,
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
