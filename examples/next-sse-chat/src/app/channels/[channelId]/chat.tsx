'use client';

import { PaperAirplaneIcon } from '@heroicons/react/24/outline';
import { Avatar } from '~/components/avatar';
import { Button } from '~/components/button';
import { Textarea } from '~/components/input';
import { trpc } from '~/lib/trpc';
import { cx } from 'class-variance-authority';
import { format, formatDistanceToNow, isToday } from 'date-fns';
import type { Session } from 'next-auth';
import * as React from 'react';
import {
  useLivePosts,
  useThrottledIsTypingMutation,
  useWhoIsTyping,
} from './hooks';

const pluralize = (count: number, singular: string, plural: string) =>
  count === 1 ? singular : plural;

const listWithAnd = (list: string[]) => {
  if (list.length === 0) {
    return '';
  }
  if (list.length === 1) {
    return list[0];
  }
  if (list.length === 2) {
    return `${list[0]} and ${list[1]}`;
  }
  return `${list.slice(0, -1).join(', ')}, and ${list.at(-1)}`;
};

export function Chat(
  props: Readonly<{ session: Session | null; channelId: string }>,
) {
  const { channelId } = props;
  const livePosts = useLivePosts(channelId);
  const currentlyTyping = useWhoIsTyping(channelId);
  const scrollRef = React.useRef<HTMLDivElement>(null);

  return (
    <main className="flex-1 overflow-hidden">
      <div className="flex h-full flex-col">
        <div
          className="flex flex-1 flex-col-reverse overflow-y-scroll p-4 sm:p-6 lg:p-8"
          ref={scrollRef}
        >
          {/* Inside this div things will not be reversed. */}
          <div>
            <div className="grid gap-4">
              <div>
                <Button
                  disabled={
                    !livePosts.query.hasNextPage ||
                    livePosts.query.isFetchingNextPage
                  }
                  onClick={() => {
                    livePosts.query.fetchNextPage();
                  }}
                >
                  {livePosts.query.isFetchingNextPage
                    ? 'Loading...'
                    : !livePosts.query.hasNextPage
                    ? 'Fetched everything!'
                    : 'Load more'}
                </Button>
              </div>
              {livePosts.messages?.map((item) => {
                const isMe = item.author === props.session?.user?.name;

                return (
                  <div
                    key={item.id}
                    className={cx(
                      'flex items-start gap-3',
                      isMe ? 'justify-end' : 'justify-start',
                    )}
                  >
                    <Avatar
                      alt="Avatar"
                      className="size-8"
                      initials={item.author?.substring(0, 2)}
                      src={`https://github.com/${item.author}.png`}
                    />

                    <div className="flex flex-col gap-1">
                      <div
                        className={cx(
                          'rounded-lg bg-gray-100 p-3 text-sm ',
                          isMe
                            ? 'bg-gray-300 dark:bg-gray-800'
                            : 'bg-gray-200 dark:bg-gray-700',
                        )}
                      >
                        <p>{item.text}</p>
                      </div>
                      <div className="text-xs text-gray-500 dark:text-gray-400">
                        {item.author} ·{' '}
                        {isToday(item.createdAt)
                          ? formatDistanceToNow(item.createdAt) + ' ago'
                          : format(item.createdAt, 'MMM d, yyyy h:mm a')}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
            <p className="text-sm italic text-gray-400">
              {currentlyTyping.length ? (
                `${listWithAnd(currentlyTyping)} ${pluralize(
                  currentlyTyping.length,
                  'is',
                  'are',
                )} typing...`
              ) : (
                <>&nbsp;</>
              )}
            </p>
          </div>
        </div>
        <div className="border-t bg-white p-2 dark:border-gray-800 dark:bg-gray-900">
          <AddMessageForm
            signedIn={!!props.session?.user}
            channelId={channelId}
            onMessagePost={() => {
              scrollRef.current?.scroll({
                // `top: 0` is actually the bottom of the chat due to `flex-col-reverse`
                top: 0,
                behavior: 'smooth',
              });
            }}
          />
        </div>
      </div>
    </main>
  );
}

function AddMessageForm(props: {
  onMessagePost: () => void;
  channelId: string;
  signedIn: boolean;
}) {
  const { channelId } = props;
  const addPost = trpc.post.add.useMutation();

  const [message, setMessage] = React.useState('');
  const [isFocused, setIsFocused] = React.useState(true);

  async function postMessage() {
    const input = {
      text: message,
      channelId,
    };
    try {
      await addPost.mutateAsync(input);
      setMessage('');
      props.onMessagePost();
    } catch {}
  }

  const isTypingMutation = useThrottledIsTypingMutation(channelId);

  React.useEffect(() => {
    // update isTyping state
    isTypingMutation(isFocused && message.trim().length > 0);
  }, [isFocused, message, isTypingMutation]);

  return (
    <div className="relative">
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          /**
           * In a real app you probably don't want to use this manually
           * Checkout React Hook Form - it works great with tRPC
           * @link https://react-hook-form.com/
           */
          await postMessage();
        }}
      >
        <Textarea
          className="pr-12"
          disabled={!props.signedIn}
          placeholder={
            props.signedIn ? 'Type your message...' : 'Sign in to post'
          }
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          rows={message.split(/\r|\n/).length}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && e.metaKey) {
              e.preventDefault();
              void postMessage();
            }
          }}
        />
        <Button
          className="absolute right-2 top-2"
          size="icon"
          type="submit"
          variant="ghost"
          disabled={!props.signedIn}
        >
          <PaperAirplaneIcon className="size-5" />
          <span className="sr-only">Send message</span>
        </Button>
      </form>
    </div>
  );
}
