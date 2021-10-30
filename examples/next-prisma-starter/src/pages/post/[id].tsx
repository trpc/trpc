/**
 * Given we're this file something like `pages/posts/[id].tsx`
 */
import { createSSGHelpers } from '@trpc/react/ssg';
import {
  GetStaticPaths,
  GetStaticPropsContext,
  InferGetStaticPropsType,
} from 'next';
import { prisma } from 'server/context';
import { getSSG } from 'server/lib/getSSG';
import { appRouter } from 'server/routers/_app';
import superjson from 'superjson';
import { trpc } from 'utils/trpc';

export const getStaticPaths: GetStaticPaths = async () => {
  const posts = await prisma.post.findMany({
    select: {
      id: true,
    },
  });

  return {
    paths: posts.map((post) => ({
      params: {
        id: post.id,
      },
    })),
    // https://nextjs.org/docs/basic-features/data-fetching#fallback-blocking
    fallback: 'blocking',
  };
};

export const getStaticProps = getSSG(async ({ ssg, context }) => {
  const id = context.params?.id as string;

  await ssg.fetchQuery('post.byId', {
    id: context.params?.id as string,
  });

  return {
    props: {
      trpcState: ssg.dehydrate(),
      id,
    },
    revalidate: 1,
  };
});

export default function PostViewPage(
  props: InferGetStaticPropsType<typeof getStaticProps>,
) {
  const { id } = props;
  const postQuery = trpc.useQuery(['post.byId', { id }]);

  if (postQuery.status !== 'success') {
    // won't happen since we're using `fallback: "blocking"`
    return <>Loading...</>;
  }
  const { data } = postQuery;
  return (
    <>
      <h1>{data.title}</h1>
      <em>Created {data.createdAt.toLocaleDateString()}</em>

      <p>{data.text}</p>

      <h2>Raw data:</h2>
      <pre>{JSON.stringify(data, null, 4)}</pre>
    </>
  );
}
