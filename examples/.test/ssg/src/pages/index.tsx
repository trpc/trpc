import { createServerSideHelpers } from '@trpc/react-query/server';
import { appRouter } from '~/server/routers/_app';
import { trpc } from '~/utils/trpc';
import superjson from 'superjson';

/**
 * This page will be served statically
 * @see https://trpc.io/docs/v11/ssg
 */
export const getStaticProps = async () => {
  const ssg = createServerSideHelpers({
    router: appRouter,
    ctx: {},
    transformer: superjson,
  });

  await ssg.greeting.fetch({ name: 'client' });

  return {
    props: {
      trpcState: ssg.dehydrate(),
    },
    revalidate: 1,
  };
};

export default function IndexPage() {
  const result = trpc.greeting.useQuery({ name: 'client' });

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
      <h1>{result.data.text}</h1>
      <p>{result.data.date.toDateString()}</p>
    </div>
  );
}

const styles = {
  width: '100vw',
  height: '100vh',
  display: 'flex',
  justifyContent: 'center',
  alignItems: 'center',
};
