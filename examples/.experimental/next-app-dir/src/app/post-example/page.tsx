import { Button } from '@shared/ui/components/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@shared/ui/components/card';
import { api } from '~/trpc/server-invoker';
import { LatestPostCard, PostFields } from '../_components/latest-post';
import { PageHeader } from '../_components/page-header';

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
    <>
      <PageHeader
        title="Full-stack post example"
        description={
          <>
            A Server Component reads <code>getLatestPost</code>. The form&apos;s
            Server Action calls <code>createPost</code>, then revalidates{' '}
            <code>getLatestPost</code>.
          </>
        }
      />
      <div className="grid items-start gap-6 md:grid-cols-2">
        <LatestPostCard post={latestPost} />
        <Card>
          <CardHeader>
            <CardTitle>Create a post</CardTitle>
            <CardDescription>
              Works without JavaScript: the form posts to the Server Action.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form className="flex flex-col gap-4" action={action}>
              <PostFields />
              <Button type="submit" className="self-start">
                Create post
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    </>
  );
}
