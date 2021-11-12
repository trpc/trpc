import { createSSGHelpers } from '@trpc/react/ssg';
import { GetStaticPropsContext, InferGetStaticPropsType } from 'next';
import { createContext } from 'server/context';
import { appRouter } from 'server/routers/_app';
import superjson from 'superjson';
import { ExamplePage } from 'utils/example';
import { trpc } from 'utils/trpc';
import { ssgProps } from 'feature/ssg/meta';

export default function Page(
  props: InferGetStaticPropsType<typeof getStaticProps>,
) {
  const { id } = props;
  const query = trpc.useQuery(['ssg.byId', { id }]);

  // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
  const post = query.data!;
  return (
    <>
      <ExamplePage {...ssgProps} />{' '}
      <article className="prose">
        <h1>{post.title}</h1>
      </article>
    </>
  );
}

export async function getStaticProps(context: GetStaticPropsContext) {
  const ssg = createSSGHelpers({
    router: appRouter,
    ctx: await createContext(),
    transformer: superjson, // adds superjson serialization
  });

  const id = '1';
  const post = await ssg.fetchQuery('ssg.byId', { id });

  if (!post) {
    return {
      notFound: true,
    };
  }
  return {
    props: {
      trpcState: ssg.dehydrate(),
      id,
    },
    revalidate: 1,
  };
}
