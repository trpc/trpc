import React from 'react';
import { tweets } from './tweets';

export const TwitterWall = () => {
  return (
    <div className="grid grid-cols-1 gap-4 mt-6 lg:grid-cols-3">
      {tweets.map((column, index) => (
        <div key={`column-${index}`} className="flex flex-col gap-4">
          {column.map((tweet) => (
            <a
              href={`https://twitter.com/${tweet.handle}/status/${tweet.id}`}
              key={tweet.id}
            >
              <div
                key={tweet.id}
                className="p-6 rounded-lg dark:bg-zinc-800 bg-zinc-100 hover:bg-zinc-200 hover:dark:bg-zinc-900"
              >
                <a
                  href={`https://twitter.com/${tweet.handle}`}
                  className="cursor-pointer"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3 group">
                      <img
                        src={tweet.avatar}
                        alt={tweet.name}
                        className="w-12 h-12 rounded-full"
                      />
                      <div className="group-hover:underline">
                        <p className="text-base font-bold">{tweet.name}</p>
                        <p className="text-sm text-zinc-600 dark:text-zinc-400">
                          {tweet.handle}
                        </p>
                      </div>
                    </div>

                    <div className="text-sm text-zinc-600 dark:text-zinc-400">
                      <p>{tweet.date}</p>
                    </div>
                  </div>
                </a>
                <p className="pt-4 whitespace-pre-wrap text-zinc-600 dark:text-zinc-400">
                  {tweet.content}
                </p>
              </div>
            </a>
          ))}
        </div>
      ))}
    </div>
  );
};
