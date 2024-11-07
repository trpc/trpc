import { api } from '~/trpc/server-invoker';

export const dynamic = 'force-dynamic';

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
        <span>Created At: {latestPost.createdAt.toLocaleString()}</span>
      </div>
      <form
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: 8,
          maxWidth: 300,
          marginTop: 16,
        }}
        action={action}
      >
        <input name="title" placeholder="title" />
        <input name="content" placeholder="content" />
        <button type="submit">Create Post!</button>
      </form>
    </div>
  );
}
