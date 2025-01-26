import { useQuery } from '@tanstack/react-query';
import { useTRPC } from './utils/trpc';

export function Greeting() {
  const trpc = useTRPC();

  const greeting = useQuery(trpc.greeting.queryOptions({ name: 'tRPC user' }));

  return <div>{greeting.data?.text}</div>;
}
