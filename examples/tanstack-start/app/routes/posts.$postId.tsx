import { useSuspenseQuery } from '@tanstack/react-query';
import { createFileRoute, ErrorComponent, Link } from '@tanstack/react-router';
import { NotFound } from '~/components/NotFound';
import { useTRPC } from '~/trpc/react';

export const Route = createFileRoute('/posts/$postId')({
  loader: async ({ params: { postId }, context }) => {
    const data = await context.queryClient.ensureQueryData(
      context.trpc.post.byId.queryOptions({ id: postId }),
    );

    return { title: data.title };
  },
  head: ({ loaderData }) => ({
    meta: [{ title: loaderData.title }],
  }),
  errorComponent: ({ error }) => <ErrorComponent error={error} />,
  notFoundComponent: () => {
    return <NotFound>Post not found</NotFound>;
  },
  component: PostComponent,
});

function PostComponent() {
  const { postId } = Route.useParams();
  const trpc = useTRPC();

  const postQuery = useSuspenseQuery(
    trpc.post.byId.queryOptions({ id: postId }),
  );

  return (
    <div className="space-y-2">
      <h4 className="text-xl font-bold underline">{postQuery.data.title}</h4>
      <div className="text-sm">{postQuery.data.body}</div>
      <Link
        to="/posts/$postId/deep"
        params={{
          postId: postQuery.data.id,
        }}
        activeProps={{ className: 'text-black font-bold' }}
        className="block py-1 text-blue-800 hover:text-blue-600"
      >
        Deep View
      </Link>
    </div>
  );
}
