import Head from 'next/head';
import { ReactQueryDevtools } from 'react-query/devtools';
import { trpc } from '../utils/trpc';
import Link from 'next/link';
import { Fragment, useCallback, useEffect, useState } from 'react';

export default function IndexPage() {
  const postsQuery = trpc.useInfiniteQuery(['posts.infinite', {}], {
    getPreviousPageParam: (d) => d.prevCursor,
  });
  const { hasPreviousPage, isFetchingPreviousPage, fetchPreviousPage } =
    postsQuery;
  const addPost = trpc.useMutation('posts.add');
  const utils = trpc.useContext();

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

  // when new data, merge with current state
  useEffect(() => {
    const msgs = postsQuery.data?.pages.map((page) => page.items).flat();
    addMessages(msgs);
  }, [postsQuery.data?.pages, addMessages]);

  // sstart subscription
  trpc.useSubscription(['posts.events'], {
    onNext({ type, data }) {
      if (type === 'add') {
        addMessages([data]);
      }
    },
    onError(err) {
      console.error('Subscription error:', err);
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
          We have a simple backend subscription that nudges the client to
          invalidate the cache which then triggers a refetch.
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
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          /**
           * In a real app you probably don't want to use this manually
           * Checkout React Hook Form - it works great with tRPC
           * @link https://react-hook-form.com/
           */

          const $text: HTMLInputElement = (e as any).target.elements.text;
          const $name: HTMLInputElement = (e as any).target.elements.name;
          const input = {
            name: $name.value,
            text: $text.value,
          };
          try {
            await addPost.mutateAsync(input);
            utils.invalidateQuery(['posts.all']);

            $text.value = '';
          } catch {}
        }}
      >
        <label htmlFor="name">Your name:</label>
        <br />
        <input id="name" name="name" type="text" disabled={addPost.isLoading} />

        <br />
        <label htmlFor="text">Text:</label>
        <br />
        <textarea id="text" name="text" disabled={addPost.isLoading} />
        <br />
        <input type="submit" disabled={addPost.isLoading} />
        {addPost.error && (
          <p style={{ color: 'red' }}>{addPost.error.message}</p>
        )}
      </form>
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
