import {
  Alert,
  AlertAction,
  AlertDescription,
  AlertTitle,
} from '@shared/ui/components/alert';
import { Avatar, AvatarFallback } from '@shared/ui/components/avatar';
import { Badge } from '@shared/ui/components/badge';
import { Button, buttonVariants } from '@shared/ui/components/button';
import { Separator } from '@shared/ui/components/separator';
import { Skeleton } from '@shared/ui/components/skeleton';
import { Spinner } from '@shared/ui/components/spinner';
import { Textarea } from '@shared/ui/components/textarea';
import { ReactQueryDevtools } from '@tanstack/react-query-devtools';
import {
  CircleAlertIcon,
  CodeXmlIcon,
  DicesIcon,
  KeyboardIcon,
  LogOutIcon,
  NetworkIcon,
  RadioIcon,
  SendHorizontalIcon,
} from 'lucide-react';
import { signIn, signOut, useSession } from 'next-auth/react';
import Head from 'next/head';
import Link from 'next/link';
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from 'react';
import { trpc } from '~/utils/trpc';

type SubscriptionStatus = ReturnType<
  typeof trpc.post.onAdd.useSubscription
>['status'];

function LiveBadge(props: { status: SubscriptionStatus }) {
  switch (props.status) {
    case 'idle':
      return <Badge variant="outline">Idle</Badge>;
    case 'connecting':
      return (
        <Badge variant="secondary">
          <Spinner />
          Connecting
        </Badge>
      );
    case 'pending':
      return (
        <Badge variant="outline">
          <span className="size-1.5 rounded-full bg-emerald-500" />
          Live
        </Badge>
      );
    case 'error':
      return <Badge variant="destructive">Disconnected</Badge>;
  }
}

function UserAvatar(props: { name: string }) {
  return (
    <Avatar>
      <AvatarFallback className="text-xs font-medium">
        {props.name.slice(0, 2).toUpperCase()}
      </AvatarFallback>
    </Avatar>
  );
}

function AddMessageForm({ onMessagePost }: { onMessagePost: () => void }) {
  const addPost = trpc.post.add.useMutation();
  const { data: session } = useSession();
  const [message, setMessage] = useState('');
  const [enterToPostMessage, setEnterToPostMessage] = useState(true);
  async function postMessage() {
    const input = {
      text: message,
    };
    try {
      await addPost.mutateAsync(input);
      setMessage('');
      onMessagePost();
    } catch {}
  }

  const isTyping = trpc.post.isTyping.useMutation();

  const userName = session?.user?.name;
  if (!userName) {
    return (
      <div className="flex items-center justify-between gap-4 rounded-xl border bg-card p-3 pl-4">
        <p className="text-sm text-muted-foreground">
          Sign in to write a message.
        </p>
        <Button onClick={() => signIn()} data-testid="signin">
          Sign in
        </Button>
      </div>
    );
  }
  const pending = addPost.status === 'pending';
  return (
    <form
      className="flex flex-col gap-2"
      onSubmit={async (e) => {
        e.preventDefault();
        /**
         * In a real app you probably don't want to use this manually
         * Checkout React Hook Form - it works great with tRPC
         * @see https://react-hook-form.com/
         */
        await postMessage();
      }}
    >
      <fieldset disabled={pending} className="min-w-0">
        <div className="flex items-end gap-2 rounded-xl border bg-card p-2 transition-shadow focus-within:border-ring focus-within:ring-3 focus-within:ring-ring/50">
          <Textarea
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            className="max-h-40 min-h-9 resize-none border-0 bg-transparent shadow-none focus-visible:ring-0 dark:bg-transparent"
            rows={message.split(/\r|\n/).length}
            id="text"
            name="text"
            placeholder={`Message as ${userName}`}
            autoFocus
            onKeyDown={async (e) => {
              if (e.key === 'Shift') {
                setEnterToPostMessage(false);
              }
              if (e.key === 'Enter' && enterToPostMessage) {
                void postMessage();
              }
              isTyping.mutate({ typing: true });
            }}
            onKeyUp={(e) => {
              if (e.key === 'Shift') {
                setEnterToPostMessage(true);
              }
            }}
            onBlur={() => {
              setEnterToPostMessage(true);
              isTyping.mutate({ typing: false });
            }}
          />
          <Button type="submit" size="icon" aria-label="Send">
            {pending ? <Spinner /> : <SendHorizontalIcon />}
          </Button>
        </div>
      </fieldset>
      {addPost.status === 'error' && (
        <Alert variant="destructive">
          <CircleAlertIcon />
          <AlertTitle>Couldn't send the message</AlertTitle>
          <AlertDescription>{addPost.error.message}</AlertDescription>
        </Alert>
      )}
    </form>
  );
}

const subscribeToNothing = () => () => undefined;

export default function IndexPage() {
  const postsQuery = trpc.post.infinite.useInfiniteQuery(
    {},
    {
      getNextPageParam: (d) => d.nextCursor,
    },
  );
  const utils = trpc.useUtils();

  // list of messages that are rendered
  const [messages, setMessages] = useState(() => {
    const msgs = postsQuery.data?.pages.map((page) => page.items).flat();
    return msgs;
  });
  type Post = NonNullable<typeof messages>[number];
  const { data: session } = useSession();
  const userName = session?.user?.name;
  const scrollTargetRef = useRef<HTMLDivElement>(null);
  // The server-rendered page is refetched on mount, so the first client render
  // is already `fetching`. Keep the server's `idle` until hydration is done.
  const hydrated = useSyncExternalStore(
    subscribeToNothing,
    () => true,
    () => false,
  );
  const loadMoreStatus = hydrated ? postsQuery.fetchStatus : 'idle';

  // fn to add and dedupe new messages onto state
  const addMessages = useCallback((incoming?: Post[]) => {
    setMessages((current) => {
      const map: Record<Post['id'], Post> = {};
      for (const msg of current ?? []) {
        map[msg.id] = msg;
      }
      for (const msg of incoming ?? []) {
        map[msg.id] = msg;
      }
      return Object.values(map).sort(
        (a, b) => a.createdAt.getTime() - b.createdAt.getTime(),
      );
    });
  }, []);

  // when new data from `useInfiniteQuery`, merge with current state
  useEffect(() => {
    const msgs = postsQuery.data?.pages.map((page) => page.items).flat();
    addMessages(msgs);
  }, [postsQuery.data?.pages, addMessages]);

  const scrollToBottomOfList = useCallback(() => {
    if (scrollTargetRef.current == null) {
      return;
    }

    scrollTargetRef.current.scrollIntoView({
      behavior: 'smooth',
      block: 'end',
    });
  }, [scrollTargetRef]);
  useEffect(() => {
    scrollToBottomOfList();
    // oxlint-disable-next-line react/exhaustive-deps
  }, []);
  // subscribe to new posts and add
  const onAdd = trpc.post.onAdd.useSubscription(undefined, {
    onData(post) {
      addMessages([post]);
    },
    onError(err) {
      console.error('Subscription error:', err);
      // we might have missed a message - invalidate cache
      utils.post.infinite.invalidate();
    },
  });

  const whoIsTyping = trpc.post.whoIsTyping.useSubscription();

  return (
    <>
      <Head>
        <title>tRPC WebSocket Starter</title>
        <link rel="icon" href="/favicon.ico" />
      </Head>
      <div className="flex h-svh flex-col bg-muted/40 md:flex-row">
        <aside className="flex w-full shrink-0 flex-col border-b bg-background md:w-80 md:border-r md:border-b-0">
          <div className="flex flex-col items-start gap-3 p-6">
            <div>
              <h1 className="text-xl font-bold tracking-tight">
                <span className="text-brand">tRPC</span> WebSocket Starter
              </h1>
              <p className="text-sm text-muted-foreground">
                Showcases WebSocket + subscription support
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <a
                className={buttonVariants({ variant: 'outline', size: 'sm' })}
                href="https://github.com/trpc/examples-next-prisma-starter-websockets"
                target="_blank"
                rel="noreferrer"
              >
                <CodeXmlIcon />
                View source on GitHub
              </a>
              <Link
                href="/about"
                className={buttonVariants({ variant: 'ghost', size: 'sm' })}
              >
                <DicesIcon />
                Random numbers over a subscription
              </Link>
            </div>
          </div>
          <Separator className="hidden md:block" />
          <div className="hidden flex-1 flex-col gap-6 overflow-y-auto p-6 md:flex">
            <section className="flex flex-col gap-3">
              <h2 className="text-sm font-medium">How it works</h2>
              <ul className="flex flex-col gap-3 text-sm text-muted-foreground">
                <li className="flex gap-3">
                  <NetworkIcon className="mt-0.5 size-4 shrink-0" />
                  <span>
                    Open the inspector's Network tab: every request goes through
                    a WebSocket
                  </span>
                </li>
                <li className="flex gap-3">
                  <RadioIcon className="mt-0.5 size-4 shrink-0" />
                  <span>
                    The <code>onAdd</code> subscription adds new messages to the
                    list as they're posted
                  </span>
                </li>
                <li className="flex gap-3">
                  <KeyboardIcon className="mt-0.5 size-4 shrink-0" />
                  <span>
                    <code>whoIsTyping</code> shows who's writing, in every open
                    tab
                  </span>
                </li>
              </ul>
            </section>
          </div>
          {userName && (
            <div className="hidden items-center gap-3 border-t p-4 md:flex">
              <UserAvatar name={userName} />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{userName}</p>
                <p className="text-xs text-muted-foreground">Signed in</p>
              </div>
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label="Sign out"
                onClick={() => signOut()}
              >
                <LogOutIcon />
              </Button>
            </div>
          )}
        </aside>

        <main className="flex min-h-0 flex-1 flex-col">
          <header className="flex h-14 shrink-0 items-center justify-between border-b bg-background px-6">
            <h2 className="font-semibold">Messages</h2>
            <LiveBadge status={onAdd.status} />
          </header>

          <div className="min-h-0 flex-1 overflow-y-auto">
            <div className="mx-auto flex min-h-full max-w-3xl flex-col justify-end gap-6 p-6">
              {(() => {
                switch (postsQuery.status) {
                  case 'pending':
                    return Array.from({ length: 4 }, (_, index) => (
                      <div key={index} className="flex gap-3">
                        <Skeleton className="size-8 rounded-full" />
                        <div className="flex flex-1 flex-col gap-2">
                          <Skeleton className="h-4 w-32" />
                          <Skeleton className="h-4 w-2/3" />
                        </div>
                      </div>
                    ));
                  case 'error':
                  case 'success':
                    return (
                      <>
                        {postsQuery.status === 'error' && (
                          <Alert variant="destructive">
                            <CircleAlertIcon />
                            <AlertTitle>Couldn't load messages</AlertTitle>
                            <AlertDescription>
                              {postsQuery.error.message}
                            </AlertDescription>
                            <AlertAction>
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => postsQuery.refetch()}
                              >
                                Try again
                              </Button>
                            </AlertAction>
                          </Alert>
                        )}
                        {/* A failed refetch or older page keeps the messages */}
                        {messages && (
                          <>
                            <div className="flex justify-center">
                              {(() => {
                                switch (loadMoreStatus) {
                                  case 'fetching':
                                    return (
                                      <Button
                                        variant="outline"
                                        size="sm"
                                        disabled
                                        data-testid="loadMore"
                                      >
                                        <Spinner />
                                        Loading…
                                      </Button>
                                    );
                                  case 'paused':
                                    return (
                                      <Button
                                        variant="outline"
                                        size="sm"
                                        disabled
                                        data-testid="loadMore"
                                      >
                                        Waiting for network…
                                      </Button>
                                    );
                                  case 'idle':
                                    return postsQuery.hasNextPage ? (
                                      <Button
                                        variant="outline"
                                        size="sm"
                                        data-testid="loadMore"
                                        onClick={() =>
                                          postsQuery.fetchNextPage()
                                        }
                                      >
                                        Load older messages
                                      </Button>
                                    ) : (
                                      <p className="text-xs text-muted-foreground">
                                        The beginning of the conversation
                                      </p>
                                    );
                                }
                              })()}
                            </div>
                            <ol className="flex flex-col gap-5">
                              {messages?.map((item) => (
                                <li key={item.id} className="flex gap-3">
                                  <UserAvatar name={item.name} />
                                  <article className="min-w-0 flex-1">
                                    <header className="flex items-baseline gap-2">
                                      <h3 className="text-sm font-semibold">
                                        {item.source === 'RAW' ? (
                                          item.name
                                        ) : (
                                          <a
                                            className="hover:underline"
                                            href={`https://github.com/${item.name}`}
                                            target="_blank"
                                            rel="noreferrer"
                                          >
                                            {item.name}
                                          </a>
                                        )}
                                      </h3>
                                      <time
                                        dateTime={item.createdAt.toISOString()}
                                        className="text-xs text-muted-foreground"
                                      >
                                        {new Intl.DateTimeFormat('en-GB', {
                                          dateStyle: 'short',
                                          timeStyle: 'short',
                                        }).format(item.createdAt)}
                                      </time>
                                    </header>
                                    <p className="leading-relaxed break-words whitespace-pre-line">
                                      {item.text}
                                    </p>
                                  </article>
                                </li>
                              ))}
                            </ol>
                          </>
                        )}
                      </>
                    );
                }
              })()}
              <div ref={scrollTargetRef}></div>
            </div>
          </div>

          <div className="shrink-0 border-t bg-background">
            <div className="mx-auto flex max-w-3xl flex-col gap-1 px-6 py-4">
              <AddMessageForm onMessagePost={() => scrollToBottomOfList()} />
              <p className="h-4 text-xs text-muted-foreground italic">
                {whoIsTyping.data?.length
                  ? `${whoIsTyping.data.join(', ')} typing…`
                  : ''}
              </p>
            </div>
          </div>
        </main>

        {process.env.NODE_ENV !== 'production' && (
          <div className="hidden md:block">
            <ReactQueryDevtools initialIsOpen={false} />
          </div>
        )}
      </div>
    </>
  );
}

/**
 * If you want to statically render this page
 * - Export `appRouter` & `createContext` from [trpc].ts
 * - Make the `opts` object optional on `createContext()`
 *
 * @see https://trpc.io/docs/v11/ssg
 */
// export const getStaticProps = async (
//   context: GetStaticPropsContext<{ filter: string }>,
// ) => {
//   const ssg = createServerSideHelpers({
//     router: appRouter,
//     ctx: await createContext(),
//   });
//
//   await ssg.fetchQuery('post.all');
//
//   return {
//     props: {
//       trpcState: ssg.dehydrate(),
//       filter: context.params?.filter ?? 'all',
//     },
//     revalidate: 1,
//   };
// };
