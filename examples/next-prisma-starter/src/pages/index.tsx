import { trpc } from '../utils/trpc';
import { NextPageWithLayout } from './_app';
import { IncomingMessage } from 'http';
import Link from 'next/link';
import { useRef } from 'react';
import { useMutation } from 'react-query';
import { useSSRForm } from '~/utils/useSSRForm';

async function getPostBody(req: IncomingMessage) {
  return new Promise<{ data: unknown }>((resolve) => {
    let body = '';
    let hasBody = false;
    req.on('data', function (data: unknown) {
      body += data;
      hasBody = true;
    });
    req.on('end', () => {
      resolve({
        data: hasBody ? body : undefined,
      });
    });
  });
}

function PostForm() {
  const utils = trpc.useContext();
  const form = useSSRForm('post.add');

  return (
    <form onSubmit={form.onSubmit} method="post">
      <label htmlFor="title">Title:</label>
      <br />
      <input
        id="title"
        name="title"
        type="text"
        disabled={form.mutation.isLoading}
      />

      <br />
      <label htmlFor="text">Text:</label>
      <br />
      <textarea id="text" name="text" disabled={form.mutation.isLoading} />
      <br />
      <input type="submit" disabled={form.mutation.isLoading} />
      {form.mutation.error && (
        <p style={{ color: 'red' }}>{form.mutation.error.message}</p>
      )}
    </form>
  );
}

const IndexPage: NextPageWithLayout = () => {
  const utils = trpc.useContext();
  const postsQuery = trpc.useQuery(['post.all']);
  const addPost = trpc.useMutation('post.add', {
    async onSuccess() {
      // refetches posts after a post is added
      await utils.invalidateQueries(['post.all']);
    },
  });

  // prefetch all posts for instant navigation
  // useEffect(() => {
  //   for (const { id } of postsQuery.data ?? []) {
  //     utils.prefetchQuery(['post.byId', { id }]);
  //   }
  // }, [postsQuery.data, utils]);

  return (
    <>
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
          <Link href={`/post/${item.id}`}>
            <a>View more</a>
          </Link>
        </article>
      ))}

      <hr />

      <PostForm />
    </>
  );
};

export default IndexPage;

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
