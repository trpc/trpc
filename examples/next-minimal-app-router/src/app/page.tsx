import { Form } from '~/components/form';
import { Input } from '~/components/input';
import { trpc } from '~/utils/trpc';
import { ClientPosts } from './client-posts';

export default async function IndexPage() {
  const greeting = await trpc.greeting.query(
    'trpc',
    { revalidate: 1 }, // revalidate every second, this does not refetch, just invalidates the cache
  );

  const posts = await trpc.postList.query(); // this query will be cached until explicitly invalidated

  return (
    <div className="mx-auto w-full max-w-md space-y-4 py-32">
      <h1 className="text-xl font-bold">{greeting}</h1>
      <h2 className="text-lg font-bold">Posts</h2>
      <ul>
        {posts.map((post) => (
          <li key={post.id}>
            {/* FIXME: transformers? */}
            {post.title} - {new Date(post.createdAt).toLocaleString()}
          </li>
        ))}
      </ul>
      <Form
        className="flex flex-col gap-2"
        action={async (fd) => {
          'use server';
          const title = fd.get('title') as string;
          await trpc.postCreate.mutate({ title });
          trpc.postList.revalidate(); // revalidate after mutation
        }}
      >
        <Input name="title" placeholder="Post Title" />
      </Form>

      <ClientPosts />
    </div>
  );
}
