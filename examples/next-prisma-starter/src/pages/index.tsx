import Head from 'next/head';
import { ReactQueryDevtools } from 'react-query/devtools';
import { trpc } from '../utils/trpc';
// import { inferQueryOutput } from 'utils/trpc';
// type Task = inferQueryOutput<'todos.all'>[number];

export default function IndexPage() {
  const postsQuery = trpc.useQuery(['posts.all']);
  const addPost = trpc.useMutation('posts.add');
  const utils = trpc.useContext();

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

      {process.env.NODE_ENV !== 'production' && (
        <ReactQueryDevtools initialIsOpen={false} />
      )}
    </>
  );
}
