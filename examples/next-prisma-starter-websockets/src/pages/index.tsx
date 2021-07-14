import Head from 'next/head';
import { ReactQueryDevtools } from 'react-query/devtools';
import { trpc } from '../utils/trpc';
import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/dist/client/router';

function AddMessageForm() {
  const addPost = trpc.useMutation('posts.add');
  const utils = trpc.useContext();
  const router = useRouter();
  const name = typeof router.query.name === 'string' && router.query.name;

  if (!name) {
    return (
      <form
        onSubmit={(e) => {
          e.preventDefault();
          const $name: HTMLInputElement = (e as any).target.elements.name;
          router.push({ query: { name: $name.value } }, undefined, {
            scroll: false,
          });
        }}
      >
        <label htmlFor="name">What&apos;s your name?</label>
        <br />
        <input id="name" name="name" type="text" autoFocus />
        <br />
        <input type="submit" />
      </form>
    );
  }
  return (
    <form
      onSubmit={async (e) => {
        e.preventDefault();
        /**
         * In a real app you probably don't want to use this manually
         * Checkout React Hook Form - it works great with tRPC
         * @link https://react-hook-form.com/
         */

        const $text: HTMLInputElement = (e as any).target.elements.text;
        const input = {
          name,
          text: $text.value,
        };
        try {
          await addPost.mutateAsync(input);
          $text.value = '';
        } catch {}
      }}
    >
      <fieldset disabled={addPost.isLoading}>
        <label htmlFor="name">Your name:</label>
        <br />
        <input id="name" name="name" type="text" disabled value={name} />

        <br />
        <label htmlFor="text">Text:</label>
        <br />
        <textarea
          id="text"
          name="text"
          autoFocus
          onKeyDown={() => {
            utils.client.mutation('posts.isTyping', {
              name,
              typing: true,
            });
          }}
          onBlur={() => {
            utils.client.mutation('posts.isTyping', {
              name,
              typing: false,
            });
          }}
        />
        <br />
        <input type="submit" />
      </fieldset>
      {addPost.error && <p style={{ color: 'red' }}>{addPost.error.message}</p>}
    </form>
  );
}

export default function IndexPage() {
  const postsQuery = trpc.useInfiniteQuery(['posts.infinite', {}], {
    getPreviousPageParam: (d) => d.prevCursor,
  });
  const utils = trpc.useContext();
  const { hasPreviousPage, isFetchingPreviousPage, fetchPreviousPage } =
    postsQuery;

  // list of messages that are rendered
  const [messages, setMessages] = useState(() => {
    const msgs = postsQuery.data?.pages.map((page) => page.items).flat();
    return msgs;
  });
  type Post = NonNullable<typeof messages>[number];

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

  // subscribe to new posts and add
  trpc.useSubscription(['posts.onAdd'], {
    onNext(post) {
      addMessages([post]);
    },
    onError(err) {
      console.error('Subscription error:', err);
      // we might have missed a message - invalidate cache
      utils.queryClient.invalidateQueries();
    },
  });

  const [currentlyTyping, setCurrentlyTyping] = useState<string[]>([]);
  trpc.useSubscription(['posts.whoIsTyping'], {
    onNext(data) {
      setCurrentlyTyping(data);
    },
  });

  return (
    <>
      <Head>
        <title>Prisma Starter</title>
        <link rel="icon" href="/favicon.ico" />
      </Head>
      <h1>tRPC WebSocket starter</h1>
      Showcases WebSocket + subscription support
      <ul>
        <li>Open inspector and head to Network tab</li>
        <li>All client requests are handled through WebSockets</li>
        <li>
          We have a simple backend subscription on new messages that adds the
          newly added message to the current state
        </li>
      </ul>
      <h2>
        Messages
        {postsQuery.status === 'loading' && '(loading)'}
      </h2>
      <button
        data-testid="loadMore"
        onClick={() => fetchPreviousPage()}
        disabled={!hasPreviousPage || isFetchingPreviousPage}
      >
        {isFetchingPreviousPage
          ? 'Loading more...'
          : hasPreviousPage
          ? 'Load More'
          : 'Nothing more to load'}
      </button>
      {messages?.map((item) => (
        <article key={item.id}>
          [
          {new Intl.DateTimeFormat('en-GB', {
            dateStyle: 'short',
            timeStyle: 'short',
          }).format(item.createdAt)}
          ] <strong>{item.name}</strong>: <em>{item.text}</em>
        </article>
      ))}
      <hr />
      <h2>Add message</h2>
      <AddMessageForm />
      <p style={{ fontStyle: 'italic' }}>
        Currently typing:{' '}
        {currentlyTyping.length ? currentlyTyping.join(', ') : 'No one'}
      </p>
      <p>
        <Link href="/about">
          <a>Go to other page that displays a random number</a>
        </Link>{' '}
        (cancels subscription)
      </p>
      {process.env.NODE_ENV !== 'production' && (
        <ReactQueryDevtools initialIsOpen={false} />
      )}
    </>
  );
}

/**
 * If you want to statically render this page
 * - Export `appRouter` & `createContext` from [trpc].ts
 * - Make the `opts` object optional on `createContext()`
 *
 * @link https://trpc.io/docs/ssg
 */
// export const getStaticProps = async (
//   context: GetStaticPropsContext<{ filter: string }>,
// ) => {
//   const ssg = createSSGHelpers({
//     router: appRouter,
//     ctx: await createContext(),
//   });
//
//   await ssg.fetchQuery('posts.all');
//
//   return {
//     props: {
//       trpcState: ssg.dehydrate(),
//       filter: context.params?.filter ?? 'all',
//     },
//     revalidate: 1,
//   };
// };
