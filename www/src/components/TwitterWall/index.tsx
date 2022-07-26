import React from 'react';
import { tweets } from './tweets';

export const TwitterWall = () => {
  return (
    <div className="grid grid-cols-1 gap-4 mt-6 lg:grid-cols-3">
      {tweets.map((column, index) => (
        <div key={`column-${index}`} className="flex flex-col gap-4">
          {column.map((tweet) => (
            <div
              key={tweet.id}
              className="p-6 rounded-lg dark:bg-zinc-800 bg-zinc-100"
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <img
                    src={tweet.avatar}
                    alt={tweet.name}
                    className="w-12 h-12 rounded-full"
                  />
                  <div>
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
              <p className="pt-4 whitespace-pre-wrap">{tweet.content}</p>
            </div>
          ))}
        </div>
      ))}
    </div>
  );
};
