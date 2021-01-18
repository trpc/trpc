// testing react-query helpers

import { createHttpClient } from './lib/browser/createHttpClient';
import { createHooks } from './lib/browser/useTRPCQuery';
import type { RootRouter } from './server';

const client = createHttpClient({
  url: '...',
});
const { useQuery, useMutation } = createHooks<RootRouter>({
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
