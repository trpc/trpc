import { useSuspenseQuery } from '@tanstack/react-query';
import { createFileRoute, Link } from '@tanstack/react-router';
import { useTRPC } from '~/trpc/react';
import { PostErrorComponent } from './posts.$postId';

export const Route = createFileRoute('/posts/$postId/deep')({
  loader: async ({ params: { postId }, context }) => {
    const data = await context.queryClient.ensureQueryData(
      //  ^?
      context.trpc.post.byId.queryOptions({ id: postId }),
    );

    return { title: data.title };
  },
  meta: ({ loaderData }) => [{ title: loaderData.title }],
  errorComponent: PostErrorComponent,
  component: PostDeepComponent,
});

function PostDeepComponent() {
  const { postId } = Route.useParams();
  const trpc = useTRPC();

  const postQuery = useSuspenseQuery(
    trpc.post.byId.queryOptions({ id: postId }),
  );
  postQuery.data;
  //        ^?

  return (
    <div className="space-y-2 p-2">
      <Link
        to="/posts"
        className="block py-1 text-blue-800 hover:text-blue-600"
      >
        ← All Posts
      </Link>
      <h4 className="text-xl font-bold underline">{postQuery.data.title}</h4>
      <div className="text-sm">{postQuery.data.body}</div>
    </div>
  );
}
