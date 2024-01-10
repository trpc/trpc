import { trpc } from './utils/trpc';

export function Greeting() {
  // TODO: why is this input VOID?!
  const greeting = trpc.greeting.useQuery({ name: 'tRPC user' });
  trpc.greeting2.useQuery('FOooo');

  return <div>{greeting.data?.text}</div>;
}
