import React from 'react';
import { trpc } from '../utils/trpc';

export default function IndexPage() {
  const ac = new AbortController();
  const utils = trpc.proxy.useContext();

  const longQuery = trpc.proxy.longQuery.useQuery('Julius', {
    trpc: { signal: ac.signal },
  });

  return (
    <div style={styles}>
      {/* the type is define, it can be autocompleted */}
      <h1>
        longQuery - {longQuery.status} -{' '}
        {longQuery.isFetching ? 'fetching' : 'idle'}
      </h1>
      <h2>{longQuery.data ?? 'Loading longQuery'}</h2>
      <button onClick={() => utils.longQuery.refetch()}>
        Refetch longQuery
      </button>
      <button onClick={() => utils.longQuery.cancel()}>Cancel longQuery</button>
      <button onClick={() => ac.abort()}>Abort longQuery</button>
    </div>
  );
}

const styles = {
  width: '100vw',
  height: '100vh',
  display: 'flex',
  flexDirection: 'column' as any, // wtf?
  justifyContent: 'center',
  alignItems: 'center',
};
