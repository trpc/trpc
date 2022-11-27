import { trpc } from './utils/trpc';

export function Greeting() {
  const greeting = trpc.greeting.useQuery({ name: 'tRPC user' });

  const utils = trpc.useContext();
  const qKey = utils.greeting.getQueryKey({ name: 'tRPC user' });
  console.log('qKey', qKey);

  return <div>{greeting.data?.text}</div>;
}
