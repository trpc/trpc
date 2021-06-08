import Head from 'next/head';
import { ReactNode } from 'react';
import { ReactQueryDevtools } from 'react-query/devtools';
import { trpc } from '../utils/trpc';
// import { inferQueryOutput } from 'utils/trpc';
// type Task = inferQueryOutput<'todos.all'>[number];

const batchingIds = [
  '00000000-0000-1000-a000-000000000000',
  '00000000-0000-1000-a000-000000000001',
  '00000000-0000-1000-a000-000000000002',
];
export function Batching() {
  const postIndex0 = trpc.useQuery(['posts.byId', batchingIds[0]]);
  const postIndex1 = trpc.useQuery(['posts.byId', batchingIds[1]]);
  const postIndex2 = trpc.useQuery(['posts.byId', batchingIds[2]]);
  const utils = trpc.useContext();
  const scaffoldMutation = trpc.useMutation('posts.add', {
    onSuccess(data) {
      return utils.prefetchQuery(['posts.byId', data.id]);
    },
  });

  if (!postIndex0.data) {
    return postIndex0.isLoading ? (
      <>...</>
    ) : (
      <button
        disabled={scaffoldMutation.isLoading}
        onClick={() => {
          batchingIds.map((id, index) => {
            scaffoldMutation.mutate({
              id,
              title: `Scaffoleded post ${index + 1}`,
              text: 'n/a',
            });
          });
        }}
      >
        Scaffold some posts
      </button>
    );
  }
  return (
    <>
      <h3>Scaffolded posts</h3>
      <p>Check inspector for batching magic</p>
      <pre>
        {JSON.stringify(
          [postIndex0.data, postIndex1.data, postIndex2.data],
          null,
          2,
        )}
      </pre>
    </>
  );
}

export default function IndexPage() {
  const postsQuery = trpc.useQuery(['posts.all']);
  const addPost = trpc.useMutation('posts.add');
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
        <article key={item.id}>
          <h3>{item.title}</h3>
          <p>{item.text.substr(0)}</p>
        </article>
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
            utils.invalidateQuery(['posts.all']);

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

      <hr />

      <h2>Illustrate batching</h2>
      <Batching />

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
