import { useQueryClient } from '@tanstack/react-query';
import * as React from 'react';
import { useTRPCClient } from './utilsClient.trpc';

export function Component() {
  const trpcClient = useTRPCClient();
  const queryClient = useQueryClient();
  const [value, setValue] = React.useState<number>();

  React.useEffect(() => {
    void trpcClient.num.query(5).then(setValue);
  }, [queryClient]);

  return value === 5 ? 'loaded' : 'loading';
}
