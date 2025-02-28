import { useSuspenseQuery } from '@tanstack/react-query';
import { createFileRoute, ErrorComponent, Link } from '@tanstack/react-router';
import { useTRPC } from '~/trpc/react';

export const Route = createFileRoute('/posts_/$postId/deep')({
  loader: async ({ params: { postId }, context }) => {
    const data = await context.queryClient.ensureQueryData(
      //  ^?
      context.trpc.post.byId.queryOptions({ id: postId }),
    );

    return { title: data.title };
  },
  head: ({ loaderData }) => ({
    meta: [{ title: loaderData.title }],
  }),
  errorComponent: ({ error }) => <ErrorComponent error={error} />,
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
