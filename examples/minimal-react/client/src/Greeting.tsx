import { useQuery } from '@tanstack/react-query';
import { useTRPC } from './utils/trpc';

export function Greeting() {
  const trpc = useTRPC();
  const query = trpc.greeting.queryOptions({ name: 'tRPC user' });
  type t = typeof query;
  const greeting = useQuery(query);

  return <div>{greeting.data?.text}</div>;
}
