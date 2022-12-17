import React from 'react';
import { tweets } from './script.output';

const latestTweets = tweets.data
  .map((tweet) => ({
    ...tweet,
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    user: tweets.includes.users.find((user) => user.id === tweet.author_id)!,
  }))
  .map((tweet) => {
    let text = tweet.text;
    tweet.entities.urls?.forEach((url) => {
      if (url.display_url.startsWith('twitter.com')) {
        text = text.replace(url.url, '');
        return;
      }
      text = text.replace(url.url, url.display_url);
    });
    text = text.trim();
    return {
      ...tweet,
      text,
    };
  });

export const TwitterWall = () => {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-4 my-6 rounded-xl">
      {latestTweets.map((tweet) => (
        <a
          id="tweet"
          href={`https://twitter.com/${tweet.user.id}/status/${tweet.id}`}
          key={tweet.id}
          className="p-6 overflow-hidden transition-colors rounded-lg dark:bg-zinc-800/50 bg-zinc-100 hover:bg-zinc-200 hover:dark:bg-zinc-700/50"
        >
          <div className="flex items-center justify-between">
            <a
              href={`https://twitter.com/${tweet.user.username}`}
              className="cursor-pointer"
            >
              <div className="flex items-center gap-3 group">
                <img
                  src={tweet.user.profile_image_url}
                  alt={tweet.user.username}
                  className="w-12 h-12 rounded-full"
                />
                <div className="group-hover:underline">
                  <p className="text-base font-bold">{tweet.user.name}</p>
                  <p className="text-sm text-zinc-600 dark:text-zinc-400">
                    {tweet.user.username}
                  </p>
                </div>
              </div>
            </a>
            <div className="text-sm text-zinc-600 dark:text-zinc-400">
              <p>
                {new Date(tweet.created_at).toLocaleDateString('en-US', {
                  month: 'short',
                  day: 'numeric',
                })}
              </p>
            </div>
          </div>

          <p className="pt-4 whitespace-pre-wrap text-zinc-600 dark:text-zinc-400">
            {tweet.text}
          </p>
        </a>
      ))}
    </div>
  );
};
