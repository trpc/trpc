import { trpc } from './utils/trpc';

export function Greeting() {
  const greeting = trpc.greeting.useQuery();

  const utils = trpc.useContext();
  const qKey = utils.greeting.getQueryKey();
  console.log('qKey', qKey);

  return <div>{greeting.data?.text}</div>;
}
