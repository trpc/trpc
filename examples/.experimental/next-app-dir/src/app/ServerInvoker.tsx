import { api } from '~/trpc/server-invoker';

export async function ServerInvoker() {
  const data = await api.greeting.query({
    text: 'i never hit an api endpoint',
  });

  console.log({ serverInvoker: data });

  return <div>Server {data}</div>;
}
