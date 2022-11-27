import { useQueryClient } from '@tanstack/react-query';
import { trpc } from './utils/trpc';

export function Greeting() {
  const qc = useQueryClient();
  const utils = trpc.useContext();

  const greeting = trpc.greeting.useQuery();
  const qKey = utils.greeting.getQueryKey();

  const isFetching = qc.isFetching({ queryKey: qKey });

  console.log('qKey', qKey);
  console.log('isFetching', isFetching);

  return (
    <div>
      {greeting.data?.text ?? 'Loading...'}
      {!!isFetching && ' (fetching)'}
      <button onClick={() => greeting.refetch()}></button>
    </div>
  );
}
