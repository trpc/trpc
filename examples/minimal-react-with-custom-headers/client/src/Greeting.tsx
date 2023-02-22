import { useCallback } from 'react';
import { setToken } from './utils/client';
import { trpc } from './utils/trpc';

export function Greeting() {
  const { data, refetch } = trpc.greeting.useQuery();

  const onUpdateToken = useCallback(() => {
    console.log('onUpdateToken');
    setToken('custom-token');
    refetch();
  }, [refetch]);

  return (
    <div>
      <p>{data?.text}</p>
      <div>
        <button onClick={onUpdateToken}>Update token, and refetch</button>
      </div>
    </div>
  );
}
