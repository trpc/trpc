import {
  Alert,
  AlertDescription,
  AlertTitle,
} from '@shared/ui/components/alert';
import {
  Avatar,
  AvatarFallback,
  AvatarImage,
} from '@shared/ui/components/avatar';
import { Badge } from '@shared/ui/components/badge';
import { Bubble, BubbleContent } from '@shared/ui/components/bubble';
import { Button, buttonVariants } from '@shared/ui/components/button';
import {
  Message,
  MessageAvatar,
  MessageContent,
  MessageFooter,
} from '@shared/ui/components/message';
import { Spinner } from '@shared/ui/components/spinner';
import { Textarea } from '@shared/ui/components/textarea';
import { useMutation, useSuspenseInfiniteQuery } from '@tanstack/react-query';
import { fromHandle } from '@trpc/tanstack-react-query/unstable-handles';
import type { inferInfiniteQueryHandle } from '@trpc/tanstack-react-query/unstable-handles';
import { format, formatDistanceToNow, isToday } from 'date-fns';
import {
  CircleAlertIcon,
  HashIcon,
  SendHorizontalIcon,
  WifiOffIcon,
} from 'lucide-react';
import * as React from 'react';
import { useSession, useSignInHref } from '~/components/auth';
import { useTRPC, type TRPC } from '~/lib/trpc';
import type { PostType } from '~/server/db/schema';
import type { useLivePosts } from './hooks';
import { listWithAnd, pluralize, run } from './utils';

type LivePostsSubscription = ReturnType<typeof useLivePosts>;

function SubscriptionStatus(props: { subscription: LivePostsSubscription }) {
  const { subscription } = props;
  switch (subscription.status) {
    case 'idle':
    case 'connecting':
      // treat idle and connecting the same
      return (
        <Badge variant="secondary">
          <Spinner />
          {subscription.error ? 'Reconnecting' : 'Connecting'}
        </Badge>
      );
    case 'error':
      // something went wrong
      return (
        <div className="flex min-w-0 items-center gap-2">
          <Badge variant="destructive" title={subscription.error.message}>
            Disconnected
          </Badge>
          <Button
            size="xs"
            variant="outline"
            onClick={() => {
              subscription.reset();
            }}
          >
            Try again
          </Button>
        </div>
      );
    case 'pending':
      // we are polling for new messages
      return (
        <Badge variant="outline">
          <span className="size-1.5 rounded-full bg-emerald-500" />
          Live
        </Badge>
      );
  }
}

export function Chat(
  props: Readonly<{
    posts: inferInfiniteQueryHandle<TRPC['post']['infinite']>;
    title: React.ReactNode;
    subscription: LivePostsSubscription;
    whoIsTyping: string[];
  }>,
) {
  const channelId = props.posts.input.channelId;
  const trpc = useTRPC();
  const postsQuery = useSuspenseInfiniteQuery(
    fromHandle(trpc, props.posts, {
      getNextPageParam: (d) => d.nextCursor,
      // `useLivePosts()` adds new posts to the cache, so there's no need to refetch
      refetchOnReconnect: false,
      refetchOnWindowFocus: false,
      refetchOnMount: false,
    }),
  );
  const scrollRef = React.useRef<HTMLDivElement>(null);

  const session = useSession();
  const signInHref = useSignInHref();

  return (
    <main className="flex min-w-0 flex-1 flex-col">
      <header className="flex h-14 shrink-0 items-center justify-between gap-4 border-b bg-background px-6">
        <h2 className="flex min-w-0 items-center gap-1.5 font-semibold">
          <HashIcon className="size-4 shrink-0 text-muted-foreground" />
          <span className="truncate">{props.title}</span>
        </h2>
        <SubscriptionStatus subscription={props.subscription} />
      </header>
      <div
        className="flex min-h-0 flex-1 flex-col-reverse overflow-y-auto"
        ref={scrollRef}
      >
        {/* Inside this div things will not be reversed. */}
        <div className="mx-auto flex w-full max-w-3xl flex-col gap-5 p-6">
          <div className="flex justify-center">
            <Button
              // Load older posts when this scrolls into view. It runs again when
              // a load finishes, so it keeps going while the button stays visible.
              ref={(button) => {
                if (
                  !button ||
                  postsQuery.fetchStatus !== 'idle' ||
                  !postsQuery.hasNextPage
                )
                  return;
                const observer = new IntersectionObserver(
                  ([entry]) => {
                    if (entry?.isIntersecting) void postsQuery.fetchNextPage();
                  },
                  { rootMargin: '200px' },
                );
                observer.observe(button);
                return () => observer.disconnect();
              }}
              variant="outline"
              size="sm"
              disabled={
                postsQuery.fetchStatus !== 'idle' || !postsQuery.hasNextPage
              }
              onClick={() => {
                void postsQuery.fetchNextPage();
              }}
            >
              {run(() => {
                switch (postsQuery.fetchStatus) {
                  case 'fetching':
                    return (
                      <>
                        <Spinner />
                        Loading...
                      </>
                    );
                  case 'paused':
                    return (
                      <>
                        <WifiOffIcon />
                        Waiting for network...
                      </>
                    );
                  case 'idle':
                    return postsQuery.hasNextPage
                      ? 'Load more'
                      : 'Fetched everything!';
                }
              })}
            </Button>
          </div>

          {/* `pages[0]` is the newest page, so show the pages in reverse */}
          {postsQuery.data.pages
            .map((page, index) => (
              <PostPage
                key={index}
                posts={page.items}
                myName={session?.user?.name}
              />
            ))
            .toReversed()}
        </div>
      </div>

      <div className="shrink-0 border-t bg-background">
        <div className="mx-auto flex max-w-3xl flex-col gap-1 px-6 py-3">
          {session ? (
            <AddMessageForm
              channelId={channelId}
              onMessagePost={() => {
                scrollRef.current?.scroll({
                  // `top: 0` is actually the bottom of the chat due to `flex-col-reverse`
                  top: 0,
                  behavior: 'smooth',
                });
              }}
            />
          ) : (
            <div className="flex items-center justify-between gap-4 rounded-xl border bg-card p-3 pl-4">
              <p className="text-sm text-muted-foreground">
                Sign in to post a message.
              </p>
              <a href={signInHref} className={buttonVariants()}>
                Sign in
              </a>
            </div>
          )}
          <p className="h-4 text-xs text-muted-foreground italic">
            {props.whoIsTyping.length
              ? `${listWithAnd(props.whoIsTyping)} ${pluralize(
                  props.whoIsTyping.length,
                  'is',
                  'are',
                )} typing...`
              : null}
          </p>
        </div>
      </div>
    </main>
  );
}

/**
 * One page of posts. Unchanged pages keep their `posts` array, so React
 * Compiler reuses their output when a new post lands on the newest page.
 */
function PostPage(
  props: Readonly<{ posts: PostType[]; myName: string | null | undefined }>,
) {
  return (
    <>
      {props.posts.map((item) => {
        const isMe = item.name === props.myName;

        return (
          <Message key={item.id} align={isMe ? 'end' : 'start'}>
            <MessageAvatar>
              <Avatar>
                <AvatarImage
                  src={`https://github.com/${item.name}.png`}
                  alt=""
                />
                <AvatarFallback className="text-xs font-medium">
                  {item.name.substring(0, 2).toUpperCase()}
                </AvatarFallback>
              </Avatar>
            </MessageAvatar>
            <MessageContent>
              <Bubble variant={isMe ? 'default' : 'outline'}>
                <BubbleContent className="whitespace-pre-wrap">
                  {item.text}
                </BubbleContent>
              </Bubble>
              <MessageFooter className="gap-1">
                <a
                  href={`https://github.com/${item.name}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="hover:underline"
                >
                  {item.name}
                </a>
                ·
                <time dateTime={item.createdAt.toISOString()}>
                  {isToday(item.createdAt)
                    ? formatDistanceToNow(item.createdAt) + ' ago'
                    : format(item.createdAt, 'MMM d, yyyy h:mm a')}
                </time>
              </MessageFooter>
            </MessageContent>
          </Message>
        );
      })}
    </>
  );
}

function AddMessageForm(props: {
  onMessagePost: () => void;
  channelId: string;
}) {
  const { channelId } = props;
  const trpc = useTRPC();
  const addPost = useMutation(trpc.post.add.mutationOptions());

  const [message, setMessage] = React.useState('');
  const textareaRef = React.useRef<HTMLTextAreaElement>(null);
  const [isFocused, setIsFocused] = React.useState(false);

  React.useEffect(() => {
    // `autoFocus` applies before hydration, when `onFocus` isn't attached yet
    setIsFocused(document.activeElement === textareaRef.current);
  }, []);

  function postMessage() {
    const input = {
      text: message,
      channelId,
    };
    setMessage('');
    addPost.mutate(input, {
      onSuccess() {
        props.onMessagePost();
      },
      onError() {
        setMessage(input.text);
      },
    });
  }

  const { mutate: setIsTyping } = useMutation(
    trpc.channel.isTyping.mutationOptions(),
  );
  const isTyping = React.useRef(false);
  const isTypingTimeout = React.useRef<ReturnType<typeof setTimeout> | null>(
    null,
  );

  // Send whether we're typing as soon as it changes, and while it doesn't,
  // again at most once a second so the server doesn't expire it
  React.useEffect(() => {
    function send() {
      if (isTypingTimeout.current) clearTimeout(isTypingTimeout.current);
      isTypingTimeout.current = null;
      setIsTyping({ typing: isTyping.current, channelId });
    }

    const nextIsTyping = isFocused && message.trim().length > 0;
    const changed = nextIsTyping !== isTyping.current;
    isTyping.current = nextIsTyping;
    if (changed) {
      send();
      return;
    }
    if (isTypingTimeout.current) return;
    isTypingTimeout.current = setTimeout(send, 1000);
  }, [isFocused, message, channelId, setIsTyping]);

  return (
    <form
      className="flex flex-col gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        /**
         * In a real app you probably don't want to use this manually
         * Checkout React Hook Form - it works great with tRPC
         * @see https://react-hook-form.com/
         */
        postMessage();
      }}
    >
      {addPost.status === 'error' && (
        <Alert variant="destructive">
          <CircleAlertIcon />
          <AlertTitle>Couldn&apos;t send the message</AlertTitle>
          <AlertDescription>{addPost.error.message}</AlertDescription>
        </Alert>
      )}
      <div className="flex items-end gap-2 rounded-xl border bg-card p-2 transition-shadow focus-within:border-ring focus-within:ring-3 focus-within:ring-ring/50">
        <Textarea
          ref={textareaRef}
          className="max-h-40 min-h-9 resize-none border-0 bg-transparent shadow-none focus-visible:ring-0 dark:bg-transparent"
          placeholder="Type your message..."
          aria-label="Message"
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          rows={message.split(/\r|\n/).length}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              postMessage();
            }
          }}
          onFocus={() => setIsFocused(true)}
          onBlur={() => setIsFocused(false)}
          autoFocus
        />
        <Button type="submit" size="icon" aria-label="Send message">
          {addPost.status === 'pending' ? <Spinner /> : <SendHorizontalIcon />}
        </Button>
      </div>
    </form>
  );
}
