'use client';

import { useQuery } from '@tanstack/react-query';
import { Suspense } from 'react';

export const dynamic = 'force-dynamic';

function useWaitQuery(props: { wait: number }) {
  const query = useQuery({
    queryKey: ['wait', props.wait],
    queryFn: async () => {
      const url = `http://localhost:3000/api/wait?wait=${props.wait}`;
      console.log('fetching', url);
      const res: string = await (
        await fetch(url, {
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
    <Suspense>
      <Suspense>
        <MyComponent wait={100} />
      </Suspense>

      <Suspense>
        <MyComponent wait={200} />
        <MyComponent wait={200} />
      </Suspense>
      <Suspense>
        <MyComponent wait={300} />
      </Suspense>
      {/* <Suspense>
        <MyComponent wait={3000} />
      </Suspense> */}
    </Suspense>
  );
}
