import React from 'react';

/**
 * Renders a tweet from static data, so posts and pages don't depend on X's
 * embeds, which break when a tweet is deleted or its account goes private.
 */
export function StaticTweet(props: {
  name: string;
  username: string;
  avatarUrl: string;
  /** URLs and @mentions in it become links */
  text: string;
  /** ISO 8601 timestamp */
  createdAt: string;
  url: string;
  /** For tweets that are gone from X */
  archiveUrl?: string;
}) {
  const date = new Date(props.createdAt);
  return (
    <figure className="m-0 w-full max-w-[550px] rounded-xl border border-solid border-zinc-200 bg-white p-4 dark:border-zinc-700 dark:bg-zinc-900">
      <figcaption className="flex items-center gap-3">
        <img
          src={props.avatarUrl}
          alt=""
          className="h-12 w-12 rounded-full"
          loading="lazy"
        />
        <cite className="not-italic">
          <span className="block text-base font-bold">{props.name}</span>
          <span className="block text-sm text-zinc-600 dark:text-zinc-400">
            @{props.username}
          </span>
        </cite>
      </figcaption>
      <blockquote
        className="my-3 whitespace-pre-wrap border-none p-0 text-lg"
        cite={props.url}
      >
        {props.text.split(/(https?:\/\/\S+|@\w+)/).map((part, index) => {
          if (part.startsWith('@')) {
            return (
              <a key={index} href={`https://x.com/${part.slice(1)}`}>
                {part}
              </a>
            );
          }
          if (/^https?:\/\//.test(part)) {
            return (
              <a key={index} href={part}>
                {part.replace(/^https?:\/\//, '')}
              </a>
            );
          }
          return part;
        })}
      </blockquote>
      <div className="flex flex-wrap justify-between gap-x-4 gap-y-1 text-sm text-zinc-600 dark:text-zinc-400">
        <a href={props.url}>
          <time dateTime={date.toJSON()}>
            {date.toLocaleDateString('en-US', {
              month: 'short',
              day: 'numeric',
              year: 'numeric',
              timeZone: 'UTC',
            })}
          </time>
        </a>
        {props.archiveUrl && <a href={props.archiveUrl}>Archived copy</a>}
      </div>
    </figure>
  );
}
