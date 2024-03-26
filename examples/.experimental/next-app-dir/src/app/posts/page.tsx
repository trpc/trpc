import { listPosts } from './_data';
import { AddPostForm } from './AddPostForm';

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

      <h2>Add post React hook form</h2>
      <AddPostForm />
      <h2>Add post useFormState</h2>
    </div>
  );
}
