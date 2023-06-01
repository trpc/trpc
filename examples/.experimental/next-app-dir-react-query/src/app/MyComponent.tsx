import { useQuery, useQueryClient } from '@tanstack/react-query';
import { use } from 'react';

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

// function useWaitQuery2(props: { wait: number }) {
//   const qc = useQueryClient();
//   const promise = qc.ensureQueryData({
//     queryKey: ['wait', props.wait],
//     queryFn: async () => {
//       const url = `http://localhost:3000/api/wait?wait=${props.wait}`;
//       console.log('fetching', url);
//       const res: string = await (
//         await fetch(url, {
//           cache: 'no-store',
//         })
//       ).json();
//       return res;
//     },
//   });

//   const data = use(promise);
//   return [data];
// }

export function MyComponent(props: { wait: number }) {
  //   console.log('rendering', props.wait);
  const [data] = useWaitQuery(props);

  return <div>result: {data}</div>;
}
