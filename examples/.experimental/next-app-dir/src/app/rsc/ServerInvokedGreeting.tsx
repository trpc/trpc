import { api } from '~/trpc/server-invoker';

export async function ServerInvokedGreeting() {
  const data = await api.greeting.query({
    text: 'i never hit an api endpoint',
  });

  return <>{data}</>;
}
