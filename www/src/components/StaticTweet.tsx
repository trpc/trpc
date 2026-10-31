import React from 'react';

const months = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
];

/** `9:41 AM · Feb 10, 2024`, in UTC, so the server and the browser agree. */
function formatTimestamp(date: Date) {
  const hours = date.getUTCHours();
  const minutes = String(date.getUTCMinutes()).padStart(2, '0');
  const time = `${hours % 12 || 12}:${minutes} ${hours < 12 ? 'AM' : 'PM'}`;
  return `${time} · ${months[date.getUTCMonth()]} ${date.getUTCDate()}, ${date.getUTCFullYear()}`;
}

/**
 * Renders a tweet from static data, styled like Twitter's embedded tweets,
 * so posts and pages don't depend on Twitter's embeds, which break when a
 * tweet is deleted or its account goes private.
 */
export function StaticTweet(props: {
  id: string;
  name: string;
  username: string;
  avatarUrl: string;
  /** URLs, @mentions and #hashtags in it become links */
  text: string;
  /** ISO 8601 timestamp */
  createdAt: string;
  /** For tweets that are gone from Twitter */
  archiveUrl?: string;
}) {
  const date = new Date(props.createdAt);
  const profileUrl = `https://twitter.com/${props.username}`;
  const tweetUrl = `${profileUrl}/status/${props.id}`;
  return (
    <figure className="tweet">
      <div className="tweet-header">
        <a className="tweet-author" href={profileUrl}>
          <img
            className="tweet-avatar"
            src={props.avatarUrl}
            alt=""
            width={48}
            height={48}
            loading="lazy"
          />
          <span className="tweet-author-names">
            <span className="tweet-name">{props.name}</span>
            <span className="tweet-username">@{props.username}</span>
          </span>
        </a>
        <svg className="tweet-bird" viewBox="0 0 24 24" aria-hidden="true">
          <path d="M23.643 4.937c-.835.37-1.732.62-2.675.733.962-.576 1.7-1.49 2.048-2.578-.9.534-1.897.922-2.958 1.13-.85-.904-2.06-1.47-3.4-1.47-2.572 0-4.658 2.086-4.658 4.66 0 .364.042.718.12 1.06-3.873-.195-7.304-2.05-9.602-4.868-.4.69-.63 1.49-.63 2.342 0 1.616.823 3.043 2.072 3.878-.764-.025-1.482-.234-2.11-.583v.06c0 2.257 1.605 4.14 3.737 4.568-.392.106-.803.162-1.227.162-.3 0-.593-.028-.877-.082.593 1.85 2.313 3.198 4.352 3.234-1.595 1.25-3.604 1.995-5.786 1.995-.376 0-.747-.022-1.112-.065 2.062 1.323 4.51 2.093 7.14 2.093 8.57 0 13.255-7.098 13.255-13.254 0-.2-.005-.402-.014-.602.91-.658 1.7-1.477 2.323-2.41z" />
        </svg>
      </div>
      <blockquote className="tweet-text" cite={tweetUrl}>
        {props.text
          .split(/(https?:\/\/\S+|(?<!\w)@\w+|(?<!\w)#\w*[a-z_]\w*)/i)
          .map((part, index) => {
            if (index % 2 === 0) {
              return part;
            }
            const href = part.startsWith('@')
              ? `https://twitter.com/${part.slice(1)}`
              : part.startsWith('#')
                ? `https://twitter.com/hashtag/${part.slice(1)}`
                : part;
            return (
              <a key={index} href={href}>
                {part.replace(/^https?:\/\//, '')}
              </a>
            );
          })}
      </blockquote>
      <div className="tweet-meta">
        <a href={tweetUrl}>
          <time dateTime={date.toJSON()}>{formatTimestamp(date)}</time>
        </a>
        {props.archiveUrl && (
          <>
            <span aria-hidden="true"> · </span>
            <a className="tweet-archive" href={props.archiveUrl}>
              Archived copy
            </a>
          </>
        )}
      </div>
      <div className="tweet-footer">
        <a href={tweetUrl}>Read more on Twitter</a>
      </div>
    </figure>
  );
}
