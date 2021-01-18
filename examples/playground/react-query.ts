// testing react-query helpers

import { createHttpClient } from './lib/browser/createHttpClient';
import { createReactQueryHooks } from './lib/browser/createReactQueryHooks';
import type { RootRouter } from './server';
import { rootRouter } from './server'; // this is only imported to show-case ssr `prefetchQuery`
const client = createHttpClient<RootRouter>({
  url: '...',
});
const { useQuery, useMutation, queryClient } = createReactQueryHooks<
  RootRouter
>({
  client,
});

{
  const { data } = useQuery(['admin/secret']);

  console.log(data);
}
{
  const { data } = useQuery(['posts/list']);

  console.log(data);
}
{
  const { data } = useQuery(['hello', 'world']);

  console.log(data);
}
{
  const { data, mutateAsync } = useMutation('posts/create');
  mutateAsync([{ title: 'hej' }]).then((res) => {
    console.log(res);
  });
  console.log('data', data);
}

{
  // ssr prefetch testing
  // https://react-query.tanstack.com/guides/ssr
  const handler = rootRouter.createQueryHandler({} as any);
  queryClient.prefetchQuery(['hello'], handler).then((data) => {
    console.log('data', data);
  });
}
