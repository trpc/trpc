import Head from 'next/head';
import { useEffect } from 'react';
import { trpc } from '../utils/trpc';

export default function Home() {
  const utils = trpc.useContext();

  const postsQuery = trpc.useQuery(['posts.list']);

  useEffect(() => {
    if (postsQuery.error) {
      console.log('error!', postsQuery.error);
    }
  }, [postsQuery.error, utils.queryClient]);
  const addPost = trpc.useMutation('posts.add', {
    onSuccess() {
      utils.invalidateQuery(['posts.list']);
    },
  });
  const fieldErrors = addPost.error?.shape?.zodError?.fieldErrors ?? {};
  return (
    <>
      <Head>
        <title>Hello tRPC</title>
        <link rel="icon" href="/favicon.ico" />
      </Head>

      <h1>tRPC starter examples</h1>

      <h1>Posts query (server rendered)</h1>

      <h2>Posts</h2>
      {postsQuery.data?.map((post) => (
        <pre key={post.id}>{JSON.stringify(post, null, 2)}</pre>
      ))}

      <h2>Add post</h2>
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
        <label htmlFor="title">Title:</label>
        <br />
        <input
          id="title"
          name="title"
          type="text"
          disabled={addPost.isLoading}
        />
        {fieldErrors.title && <div className="error">{fieldErrors.title}</div>}

        <br />
        <label htmlFor="text">Text:</label>
        <br />
        <textarea id="text" name="text" disabled={addPost.isLoading} />
        {fieldErrors.text && <div className="error">{fieldErrors.text}</div>}
        <br />
        <input type="submit" disabled={addPost.isLoading} />
        {addPost.error && <p className="error">{addPost.error.message}</p>}
      </form>
      <hr />

      <div style={{ marginTop: '100px' }}>
        <a
          href="https://vercel.com/?utm_source=trpc&utm_campaign=oss"
          target="_blank"
          rel="noreferrer"
        >
          <img
            src="/powered-by-vercel.svg"
            alt="Powered by Vercel"
            height={25}
          />
        </a>
      </div>
      <style jsx>{`
        .error {
          color: red;
        }
      `}</style>
    </>
  );
}
