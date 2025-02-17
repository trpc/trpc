import { useQuery } from '@tanstack/react-query';
import { trpc } from './utils/trpc';

export function Greeting() {
  const greeting = useQuery(trpc.greeting.queryOptions({ name: 'tRPC user' }));

  return <div>{greeting.data?.text}</div>;
}
