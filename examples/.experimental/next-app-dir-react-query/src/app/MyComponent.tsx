'use client';

import { useQuery } from '@tanstack/react-query';

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

export function MyComponent(props: { wait: number }) {
  const [data] = useWaitQuery(props);

  return <div>result: {data}</div>;
}
