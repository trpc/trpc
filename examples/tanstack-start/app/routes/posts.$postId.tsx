import { useQuery, useSuspenseQuery } from '@tanstack/react-query';
import { createFileRoute, ErrorComponent, Link } from '@tanstack/react-router';
import type { ErrorComponentProps } from '@tanstack/react-router';
import { NotFound } from '~/components/NotFound';
import { useTRPC } from '~/trpc/react';
import React from 'react';

export const Route = createFileRoute('/posts/$postId')({
  loader: async ({ params: { postId }, context }) => {
    const data = await context.queryClient.ensureQueryData(
      context.trpc.post.byId.queryOptions({ id: postId }),
    );

    return { title: data.title };
  },
  meta: ({ loaderData }) => [{ title: loaderData.title }],
  errorComponent: PostErrorComponent,
  notFoundComponent: () => {
    return <NotFound>Post not found</NotFound>;
  },
  component: PostComponent,
});

export function PostErrorComponent({ error }: ErrorComponentProps) {
  return <ErrorComponent error={error} />;
}

function PostComponent() {
  const { postId } = Route.useParams();
  const trpc = useTRPC();

  const postQuery = useQuery(trpc.post.byId.queryOptions({ id: postId }));

  const post = React.use(postQuery.promise);

  return (
    <div className="space-y-2">
      <h4 className="text-xl font-bold underline">{post.title}</h4>
      <div className="text-sm">{post.body}</div>
      <Link
        to="/posts/$postId/deep"
        params={{
          postId: post.id,
        }}
        activeProps={{ className: 'text-black font-bold' }}
        className="block py-1 text-blue-800 hover:text-blue-600"
      >
        Deep View
      </Link>
    </div>
  );
}
