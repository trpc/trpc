import { motion } from 'framer-motion';
import React from 'react';
import { popIn } from '../../animations/popIn';
import { tweets } from './script.output';

const latestTweets = [...tweets]
  .sort((a, b) => b.likeCount - a.likeCount)
  .slice(0, 12);

export const TwitterWall = () => {
  return (
    <div className="my-6 grid grid-cols-1 gap-4 rounded-xl lg:grid-cols-2 xl:grid-cols-3">
      {latestTweets.map((tweet) => (
        <motion.a
          variants={popIn}
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true }}
          href={tweet.url}
          key={tweet.id}
          aria-label={`Tweet by ${tweet.author.name}: ${tweet.text.slice(0, 100)}${tweet.text.length > 100 ? '...' : ''}`}
          className="rounded-lg bg-zinc-100 p-6 transition-colors hover:bg-zinc-200 hover:no-underline dark:bg-zinc-800/50 hover:dark:bg-zinc-700/50"
        >
          <figure>
            <figcaption className="flex items-center justify-between">
              <a
                href={`https://x.com/${tweet.author.username}`}
                className="cursor-pointer hover:underline"
              >
                <div className="group flex items-center gap-3">
                  <img
                    src={tweet.author.profilePicture}
                    alt={tweet.author.username}
                    className="h-12 w-12 rounded-full"
                  />
                  <cite className="not-italic group-hover:underline">
                    <p className="text-base font-bold">{tweet.author.name}</p>
                    <p className="text-sm text-zinc-600 dark:text-zinc-400">
                      @{tweet.author.username}
                    </p>
                  </cite>
                </div>
              </a>
              <div className="text-sm text-zinc-600 dark:text-zinc-400">
                <time dateTime={new Date(tweet.createdAt).toJSON()}>
                  {new Date(tweet.createdAt).toLocaleDateString('en-US', {
                    month: 'short',
                    day: 'numeric',
                  })}
                </time>
              </div>
            </figcaption>

            <blockquote
              className="whitespace-pre-wrap border-none pl-0 pt-4 text-zinc-600 dark:text-zinc-400"
              cite={tweet.url}
            >
              {tweet.text}
            </blockquote>
          </figure>
        </motion.a>
      ))}
    </div>
  );
};
