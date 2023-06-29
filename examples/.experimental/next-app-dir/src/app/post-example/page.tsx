import { Button } from '~/components/button';
import { Input } from '~/components/input';
import { api } from '~/trpc/server-http';

async function action(fd: FormData) {
  'use server';

  // create the post
  await api.createPost.mutate({
    title: fd.get('title') as string,
    content: fd.get('content') as string,
  });

  // revalidate the latest post
  await api.getLatestPost.revalidate();
}

export default async function PostPage() {
  const latestPost = await api.getLatestPost.query();

  return (
    <div>
      <div style={{ display: 'flex', flexDirection: 'column' }}>
        <span>Title: {latestPost.title}</span>
        <span>Content: {latestPost.content}</span>
        <span>Created At: {latestPost.createdAt.toISOString()}</span>
      </div>
      <form className="max-w-sm space-y-2" action={action}>
        <Input name="title" placeholder="title" />
        <Input name="content" placeholder="content" />
        <Button type="submit">Create Post!</Button>
      </form>
    </div>
  );
}
