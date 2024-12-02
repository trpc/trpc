import { createServerSideHelpers } from '@trpc/react-query/server';
import { ReactNode, Suspense, useLayoutEffect, useState } from 'react';
import superjson from 'superjson';
import { appRouter } from '~/server/routers/_app';
import { trpc } from '~/utils/trpc';

export const getServerSideProps = async () => {
  const ssg = createServerSideHelpers({
    router: appRouter,
    ctx: {},
    transformer: superjson,
  });

  // Lines below are used to prefetch data for the client and hydrate the internal React-Query cache
  // If you remove one of them you can observe more loading state in the browser
  // because the dependent component could not be fully server side rendered.
  // This technique helps to avoid prop drilling and makes the code cleaner.
  await ssg.greeting.prefetch({ name: 'client1' });
  await ssg.greeting.prefetch({ name: 'client2' });

  return {
    props: {
      trpcState: ssg.dehydrate(),
    },
  };
};

const DefaultOnSSR: React.FC = () => null

const NoSSR: React.FC<{ children: ReactNode; onSSR?: ReactNode }> = ({ children, onSSR = <DefaultOnSSR /> }) => {
  const [onBrowser, setOnBrowser] = useState(false)
  useLayoutEffect(() => {
    setOnBrowser(true)
  }, [])
  return <>{onBrowser ? children : onSSR}</>
}  

export default function IndexPage() {

  /*
    refetchOnMount / refetchOnWindowFocus - are set to false to prevent refetching on mount or window focus
    
    This is a default behaviour of the React-Query which Trpc uses under the hood. It can be disabled globally or configured per query.

    "Why do I still see network requests being made in the Network tab?"
    Answer: https://trpc.io/docs/client/nextjs/ssr#faq
  */
  const { data } = trpc.greeting.useQuery({ name: 'client1' }, { refetchOnMount: false, refetchOnWindowFocus: false });

  if (!data) {
    return (
      <div>
        <h1>Loading...</h1>
      </div>
    );
  }

  return (
    <div>
      <h1>{data.text}</h1>
      <p>{data.date}</p>
      <Info />
      {/*
        An example below shows how to use `useSuspenseQuery` hook however there are some limitation,
        the code works client-side only (that's why you see loading), SSR with Suspense is not fully supported yet (Next + Trpc) or I'm not aware of it.
        Another problem is with ErrorBoundery and Trpc. Quote:

        "f you use suspense with tRPC's automatic SSR in Next.js,
        the full page will crash on the server if a query fails, even if you have an <ErrorBoundary />"

        !! That's why it is not recommended yet to use in production. !!
      
        More:
        https://trpc.io/docs/client/react/suspense
        https://blog.saeloun.com/2022/01/20/new-suspense-ssr-architecture-in-react-18/
      */}
      <Suspense fallback={<h1>Loading...</h1>}>
        <NoSSR>
          <InfoSuspense />
        </NoSSR>
      </Suspense>
    </div>
  );
}

function Info() {
  // refetchOnMount is true that's why even though it's been SSR'd it will refetch on mount
  const { data, refetch } = trpc.greeting.useQuery({ name: 'client2' }, { refetchOnMount: true });

  if (!data) {
    return (
      <div>
        <h1>Loading...</h1>
      </div>
    );
  }

  return (
    <div>
      <h1>{data.text}</h1>
      <p>{data.date}</p>
      <button onClick={() => refetch()}>Update</button>
    </div>
  );
}

function InfoSuspense() {
  const [data, res] = trpc.greeting.useSuspenseQuery({ name: 'client3' }, { refetchOnMount: false, refetchOnWindowFocus: false });

  return (
    <div>
      <h1>{data.text}</h1>
      <p>{data.date}</p>
      <button onClick={() => res.refetch()}>Update</button>
    </div>
  );
}
