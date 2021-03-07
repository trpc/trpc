import Head from 'next/head';
import { trpc } from '../utils/trpc';

export default function Home() {
  const uncachedQuery = trpc.useQuery(['slow-query-uncached'], {
    refetchInterval: 5e3, // refetch data every 5s
  });
  const cachedQuery = trpc.useQuery(['slow-query-cached'], {
    refetchInterval: 5e3, // refetch data every 5s
  });
  return (
    <>
      <Head>
        <title>Cached query demo</title>
        <link rel="icon" href="/favicon.ico" />
      </Head>
      <h2>cachedQuery</h2>
      <p>status: {cachedQuery.status}</p>
      <p>
        result:{' '}
        {cachedQuery.data && (
          <code>{JSON.stringify(cachedQuery.data, null, 4)}</code>
        )}
      </p>

      <h2>uncachedQuery</h2>
      <p>status: {uncachedQuery.status}</p>
      <p>
        result:{' '}
        {uncachedQuery.data && (
          <code>{JSON.stringify(uncachedQuery.data, null, 4)}</code>
        )}
      </p>
      <div style={{ marginTop: '100px' }}>
        <a
          href="https://vercel.com/?utm_source=trpc&utm_campaign=oss"
          target="_blank"
        >
          <img
            src="/powered-by-vercel.svg"
            alt="Powered by Vercel"
            height={25}
          />
        </a>
      </div>
    </>
  );
}
