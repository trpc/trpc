'use client';

import { useQuery } from '@tanstack/react-query';
import { Suspense } from 'react';

function useWaitQuery(props: { wait: number }) {
  const query = useQuery({
    queryKey: ['wait', props.wait],
    queryFn: async () => {
      const res: string = await (
        await fetch(`http://localhost:3000/api/wait?wait=${props.wait}`, {
          cache: 'no-store',
        })
      ).json();
      return res;
    },
    suspense: true,
  });

  return [query.data as string, query] as const;
}

function MyComponent(props: { wait: number }) {
  const [data] = useWaitQuery(props);

  return <div>result: {data}</div>;
}

export default function Page() {
  return (
    <>
      <Suspense>
        <MyComponent wait={100} />
      </Suspense>

      <Suspense>
        <MyComponent wait={200} />
      </Suspense>
      <Suspense>
        <MyComponent wait={300} />
      </Suspense>
    </>
  );
}
