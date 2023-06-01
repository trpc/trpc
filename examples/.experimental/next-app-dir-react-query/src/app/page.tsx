'use client';

import { useQuery } from '@tanstack/react-query';
import { Suspense } from 'react';

function MyComponent(props: { wait: number }) {
  const { data } = useQuery({
    queryKey: ['posts', props.wait],
    queryFn: async () => {
      await new Promise((resolve) => setTimeout(resolve, props.wait));
      return `waited ${props.wait}ms` as const;
    },
    suspense: true,
  });

  return <div>waited {data}</div>;
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
