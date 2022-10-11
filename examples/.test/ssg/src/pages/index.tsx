import { createProxySSGHelpers } from '@trpc/react/ssg';
import superjson from 'superjson';
import { appRouter } from '~/server/routers/_app';
import { trpc } from '~/utils/trpc';

export const getStaticProps = async () => {
  const ssg = createProxySSGHelpers({
    router: appRouter,
    ctx: {},
    transformer: superjson,
  });

  await ssg.greeting.prefetch({ name: 'client' });

  return { props: { trpcState: ssg.dehydrate() }, revalidate: 3600 };
};

export default function IndexPage() {
  const result = trpc.greeting.useQuery({ name: 'client' });

  if (!result.data) {
    /** Unreachable state */
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
