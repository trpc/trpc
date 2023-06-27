import { api } from '~/trpc/server';
import { createPostAction } from './_actions';

export default async function Page() {
  const post = await api.getPost.query();

  return (
    <>
      <h1>Post</h1>
      <pre>{JSON.stringify(post, null, 4)}</pre>

      <br />
      <h1>Create post</h1>
      <form action={createPostAction}>
        <input type="text" name="title" placeholder="title" />
        <input type="text" name="content" placeholder="content" />
        <button type="submit">Create</button>
      </form>
    </>
  );
}
