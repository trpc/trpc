import Head from 'next/head';
import Link from 'next/link';
import { useEffect } from 'react';
import { useInView } from 'react-intersection-observer';
import { ReactQueryDevtools } from 'react-query/devtools';
import { inferQueryOutput, trpc } from '../utils/trpc';

function PostListItem(props: { item: inferQueryOutput<'post.all'>[number] }) {
  const { item } = props;
  const utils = trpc.useContext();

  const { ref, inView } = useInView({});
  useEffect(() => {
    if (!inView) {
      return;
    }
    utils.prefetchQuery(['post.byId', item.id], {
      context: { throttle: true },
    });
    return () => {
      // unmounted
      utils.cancelQuery(['post.byId', item.id]);
    };
  }, [inView, item.id, utils]);

  return (
    <article key={item.id} ref={ref}>
      <h3>{item.title}</h3>
      <Link href={`/post/${item.id}`}>
        <a>View more</a>
      </Link>
    </article>
  );
}
export default function IndexPage() {
  const postsQuery = trpc.useQuery(['post.all']);
  const addPost = trpc.useMutation('post.add');
  const utils = trpc.useContext();

  return (
    <>
      <Head>
        <title>Prisma Starter</title>
        <link rel="icon" href="/favicon.ico" />
      </Head>
      <h1>Welcome to your tRPC starter!</h1>
      <p>
        Check <a href="https://trpc.io/docs">the docs</a> whenever you get
        stuck, or ping <a href="https://twitter.com/alexdotjs">@alexdotjs</a> on
        Twitter.
      </p>
      <h2>
        Posts
        {postsQuery.status === 'loading' && '(loading)'}
      </h2>
      {postsQuery.data?.map((item) => (
        <PostListItem key={item.id} item={item} />
      ))}

      <form
        onSubmit={async (e) => {
          e.preventDefault();
          /**
           * In a real app you probably don't want to use this manually
           * Checkout React Hook Form - it works great with tRPC
           * @link https://react-hook-form.com/
           */

          const $text: HTMLInputElement = (e as any).target.elements.text;
          const $title: HTMLInputElement = (e as any).target.elements.title;
          const input = {
            title: $title.value,
            text: $text.value,
          };
          try {
            await addPost.mutateAsync(input);
            utils.invalidateQuery(['post.all']);

            $title.value = '';
            $text.value = '';
          } catch {}
        }}
      >
        <label htmlFor="title">Title:</label>
        <br />
        <input
          id="title"
          name="title"
          type="text"
          disabled={addPost.isLoading}
        />

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
