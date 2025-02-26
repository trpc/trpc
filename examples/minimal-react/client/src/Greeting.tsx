import { useQuery } from '@tanstack/react-query';
import { trpc } from './utils/trpc';

export function Greeting() {
  const greeting = useQuery(trpc.greeting.queryOptions({ name: 'tRPC user' }));
  const greeting2 = trpc.greeting.useQuery({ name: 'tRPC user' });
  const greeting3 = trpc.greeting.useQuery();
  const greeting4 = trpc.greeting.useQuery(
    { name: 'tRPC user' },
    { enabled: true },
  );
  const greeting5 = trpc.greeting.useQuery(undefined, { enabled: true });
  if (Math.random()) {
    trpc.greeting.useQuery()
  }

  greeting2.data satisfies typeof greeting.data;
  greeting3.data satisfies typeof greeting.data;
  greeting4.data satisfies typeof greeting.data;
  greeting5.data satisfies typeof greeting.data;

  return (
    <div>
      {greeting.data?.text} {greeting2.data?.text} {greeting3.data?.text}{' '}
      {greeting4.data?.text}
    </div>
  );
}
