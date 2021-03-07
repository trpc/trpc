import Head from 'next/head';
import { trpc } from '../utils/trpc';

export default function Home() {
  const uncachedQuery = trpc.useQuery(['slow-query-uncached']);
  const cachedQuery = trpc.useQuery(['slow-query-uncached']);
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
          <pre>{JSON.stringify(cachedQuery.data, null, 4)}</pre>
        )}
      </p>

      <h2>uncachedQuery</h2>
      <p>status: {uncachedQuery.status}</p>
      <p>
        result:{' '}
        {uncachedQuery.data && (
          <pre>{JSON.stringify(uncachedQuery.data, null, 4)}</pre>
        )}
      </p>
    </>
  );
}
