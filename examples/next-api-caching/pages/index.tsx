import Head from 'next/head';
import { trpc } from '../utils/trpc';

export default function Home() {
  const uncachedQuery = trpc.useQuery(['slow-query-uncached', { id: 'myId' }], {
    refetchInterval: 3000, // refetch data every 5s
  });
  const cachedQuery = trpc.useQuery(['slow-query-cached', { id: 'myId' }], {
    refetchInterval: 3000, // refetch data every 5s
  });
  return (
    <>
      <Head>
        <title>Cached query demo</title>
        <link rel="icon" href="/favicon.ico" />
      </Head>
      <h1>Cached query demo</h1>
      <p>
        Below are two identical queries that takes 3s to load; one without any
        cache headers &amp; one with{' '}
        <code>Cache-Control: s-maxage=1, stale-while-revalidate</code>.
      </p>
      <p>
        If they were both slow initially (because each Vercel deployment purges
        the cache) try doing a reload and see the difference.
      </p>
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
