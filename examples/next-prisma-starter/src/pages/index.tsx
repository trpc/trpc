import Head from 'next/head';
import { ReactQueryDevtools } from 'react-query/devtools';
import { trpc } from '../utils/trpc';
// import { inferQueryOutput } from 'utils/trpc';
// type Task = inferQueryOutput<'todos.all'>[number];

export default function IndexPage() {
  const postsQuery = trpc.useQuery(['posts.all']);
  const editPost = trpc.useMutation('posts.edit');

  return (
    <>
      <Head>
        <title>Empty Prisma Starter</title>
        <link rel="icon" href="/favicon.ico" />
      </Head>
      <h1>Welcome to your Empty tRPC starter</h1>

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

      {process.env.NODE_ENV !== 'production' && (
        <ReactQueryDevtools initialIsOpen={false} />
      )}
    </>
  );
}
