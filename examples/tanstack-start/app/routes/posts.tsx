import { useSuspenseQuery } from '@tanstack/react-query';
import { createFileRoute, Link, Outlet } from '@tanstack/react-router';
import { useTRPC } from '~/trpc/react';

export const Route = createFileRoute('/posts')({
  loader: async ({ context }) => {
    await context.queryClient.prefetchQuery(
      context.trpc.post.list.queryOptions(),
    );
  },
  head: () => ({
    meta: [{ title: 'Posts' }],
  }),
  component: PostsComponent,
});

function PostsComponent() {
  const trpc = useTRPC();
  const postsQuery = useSuspenseQuery(trpc.post.list.queryOptions());

  return (
    <div className="flex gap-2 p-2">
      <ul className="list-disc pl-4">
        {[
          ...postsQuery.data,
          { id: 'i-do-not-exist', title: 'Non-existent Post' },
        ].map((post) => {
          return (
            <li key={post.id} className="whitespace-nowrap">
              <Link
                to="/posts/$postId"
                params={{
                  postId: post.id,
                }}
                className="block py-1 text-blue-800 hover:text-blue-600"
                activeProps={{ className: 'text-black font-bold' }}
              >
                <div>{post.title.substring(0, 20)}</div>
              </Link>
            </li>
          );
        })}
      </ul>
      <hr />
      <Outlet />
    </div>
  );
}
