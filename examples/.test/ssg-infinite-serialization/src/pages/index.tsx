import { createServerSideHelpers } from '@trpc/react-query/server';
import superjson from 'superjson';
import { appRouter } from '~/server/routers/_app';
import { trpc } from '~/utils/trpc';

/**
 * This page will be served statically
 * @see https://trpc.io/docs/v11/ssg
 */
export const getStaticProps = async () => {
  const ssg = createServerSideHelpers({
    router: appRouter,
    ctx: {},
    // transformer: superjson,
  });


  await ssg.getPosts.prefetchInfinite({});

  return {
    props: {
      trpcState: ssg.dehydrate(),
    },
    revalidate: 1,
  };
};

export default function IndexPage() {
  const result = trpc.getPosts.useInfiniteQuery({}, {
    getNextPageParam: (lastPage) => lastPage.nextCursor
  });

  if (!result.data) {
    /* unreachable, page is served statically */
    return (
      <div style={styles}>
        <h1>Loading...</h1>
      </div>
    );
  }

  return (
    <div style={styles}>
      <h1>Posts</h1>
      {result.data.pages.map((page, i) => (
        <div key={i}>
          {page.items.map((post) => (
            <div key={post.id}>{post.title}</div>
          ))}
          </div>
      ))}

        <button 
          data-testid="load-more" 
          onClick={() => result.fetchNextPage()} 
          disabled={result.isFetchingNextPage || !result.hasNextPage}
        >
          {result.hasNextPage ? "Load more" : "No more posts to fetch"}
        </button>
    </div>
  );
}

const styles = {
  width: '100vw',
  height: '100vh',
  display: 'flex',
  flexDirection: 'column' as const,
};
