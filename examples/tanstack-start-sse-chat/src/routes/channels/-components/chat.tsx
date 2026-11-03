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
import { useMutation } from '@tanstack/react-query';
import {
  useSubscription,
  type unstable_inferInfiniteQueryHandle,
} from '@trpc/tanstack-react-query';
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
import { useLivePosts, useThrottledIsTypingMutation } from './hooks';
import { listWithAnd, pluralize, run } from './utils';

function SubscriptionStatus(props: {
  subscription: ReturnType<typeof useLivePosts>['subscription'];
}) {
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
    posts: unstable_inferInfiniteQueryHandle<TRPC['post']['infinite']>;
    title: React.ReactNode;
  }>,
) {
  const channelId = props.posts.input.channelId;
  const trpc = useTRPC();
  const livePosts = useLivePosts(props.posts);
  const currentlyTyping = useSubscription(
    trpc.channel.whoIsTyping.subscriptionOptions({ channelId }),
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
        <SubscriptionStatus subscription={livePosts.subscription} />
      </header>
      <div
        className="flex min-h-0 flex-1 flex-col-reverse overflow-y-auto"
        ref={scrollRef}
      >
        {/* Inside this div things will not be reversed. */}
        <div className="mx-auto flex w-full max-w-3xl flex-col gap-5 p-6">
          <div className="flex justify-center">
            <Button
              variant="outline"
              size="sm"
              disabled={
                livePosts.query.fetchStatus !== 'idle' ||
                !livePosts.query.hasNextPage
              }
              onClick={() => {
                void livePosts.query.fetchNextPage();
              }}
            >
              {run(() => {
                switch (livePosts.query.fetchStatus) {
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
                    return livePosts.query.hasNextPage
                      ? 'Load more'
                      : 'Fetched everything!';
                }
              })}
            </Button>
          </div>

          {livePosts.messages?.map((item) => {
            const isMe = item.name === session?.user?.name;

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
            {currentlyTyping.data?.length
              ? `${listWithAnd(currentlyTyping.data)} ${pluralize(
                  currentlyTyping.data.length,
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

  const isTypingMutation = useThrottledIsTypingMutation(channelId);

  React.useEffect(() => {
    // update isTyping state
    isTypingMutation(isFocused && message.trim().length > 0);
  }, [isFocused, message, isTypingMutation]);

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
