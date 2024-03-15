import { listPosts } from './_data';
import { AddPostForm_invoked } from './AddPostForm_invoked';
import { AddPostForm_RHF } from './AddPostForm_ReactHookForm';
import { AddPostForm_useFormState } from './AddPostForm_useFormState';

export default async function Home() {
  const posts = await listPosts();

  console.log({ posts });
  return (
    <div>
      <h1>All posts</h1>

      <ul>
        {posts.output?.map((post) => (
          <li key={post.id}>
            <a href={`/posts/${post.id}`}>{post.title}</a>
          </li>
        ))}
      </ul>

      <h2>Add post React hook form</h2>
      <AddPostForm_RHF />
      <h2>Add post useFormState</h2>
      <AddPostForm_useFormState />
      <h2>Add post invoked</h2>
      <AddPostForm_invoked />
    </div>
  );
}
