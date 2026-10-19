import { useQuery } from '@tanstack/react-query';
import { trpc } from './utils/trpc';

export function Greeting() {
  const greeting = useQuery(trpc.greeting.queryOptions({ name: 'tRPC user' }));

  // 💡 `greeting` has no `.errors()` of its own, so `greeting.error.data` only
  //    ever has the router-wide shape - try reading `.kind` off it.
  return <p>{greeting.data?.text}</p>;
}
