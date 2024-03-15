import type { ReactNode } from 'react';
import { listPosts } from './_data';
import { addPostSchema } from './_data.schema';

function AddPostForm() {
  return (
    <form action={addPostSchema}>
      <input name="title" />
      <input name="content" />
      <button type="submit">Add post</button>
    </form>
  );
}

export default async function Home() {
  const posts = await listPosts();
  return (
    <div>
      <h1>All posts</h1>

      <ul>
        {posts.map((post) => (
          <li key={post.id}>
            <a href={`/posts/${post.id}`}>{post.title}</a>
          </li>
        ))}
      </ul>

      <h2>Add post</h2>
      <AddPostForm />
    </div>
  );
}
