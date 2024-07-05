import { trpc } from './utils/trpc';

export function Greeting() {
  const [data] = trpc.greeting.useSuspenseQuery({ name: 'tRPC user' });

  return <div>{data.text}</div>;
}
