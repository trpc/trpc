import Head from 'next/head';
import { trpc } from '../utils/trpc';
import { appRouter } from './api/trpc/[trpc]';

export default function Home() {
  // try typing here to see that you get autocompletion & type safety on the procedure's name
  const helloNoArgs = trpc.useQuery(['hello']);
  const helloWithArgs = trpc.useQuery(['hello', { text: 'client' }]);

  // try to uncomment next line to show type checking:
  // const helloWithInvalidArgs = trpc.useQuery(['hello', { text: false }]);

  console.log(helloNoArgs.data); // <-- hover over this object to see it's type inferred

  const postsQuery = trpc.useQuery(['posts.list']);
  const addPost = trpc.useMutation('posts.add', {
    onSuccess() {
      trpc.queryClient.invalidateQueries('posts.list');
    },
  });
  return (
    <>
      <Head>
        <title>Hello tRPC</title>
        <link rel="icon" href="/favicon.ico" />
      </Head>

      <h1>tRPC starter examples</h1>

      <h1>Posts query (statically rendered)</h1>

      <h2>Posts</h2>
      {postsQuery.data?.map((post) => (
        <pre key={post.id}>{JSON.stringify(post, null, 2)}</pre>
      ))}

      <form
        onSubmit={async (e) => {
          e.preventDefault();
          const $text: HTMLInputElement = (e as any).target.elements.text;
          const $title: HTMLInputElement = (e as any).target.elements.title;
          const input = {
            title: $title.value,
            text: $text.value,
          };
          try {
            await addPost.mutateAsync(input);
            $title.value = '';
            $text.value = '';
          } catch {}
        }}
      >
        <label>
          Title:
          <br />
          <input name="title" type="text" disabled={addPost.isLoading} />
        </label>

        <br />
        <label>
          Text:
          <br />
          <textarea name="text" disabled={addPost.isLoading} />
        </label>
        <br />
        <input type="submit" disabled={addPost.isLoading} />
        {addPost.error && (
          <p style={{ color: 'red' }}>{addPost.error.message}</p>
        )}
      </form>
      <hr />
      <h2>Hello World queries</h2>
      <ul>
        <li>
          helloNoArgs ({helloNoArgs.status}):{' '}
          <pre>{JSON.stringify(helloNoArgs.data, null, 2)}</pre>
        </li>
        <li>
          helloWithArgs ({helloWithArgs.status}):{' '}
          <pre>{JSON.stringify(helloWithArgs.data, null, 2)}</pre>
        </li>
      </ul>

      <div style={{ marginTop: '100px' }}>
        <a
          href="https://vercel.com/?utm_source=trpc&utm_campaign=oss"
          target="_blank"
        >
          <img
            src="/powered-by-vercel.svg"
            alt="Powered by Vercel"
            height={25}
          />
        </a>
      </div>
      <h2>Add post</h2>
    </>
  );
}

export async function getStaticProps() {
  const ssr = trpc.ssr(appRouter, {});

  await ssr.prefetchQuery('posts.list');

  return {
    props: {
      dehydratedState: trpc.dehydrate(),
    },
    revalidate: 1,
  };
}
