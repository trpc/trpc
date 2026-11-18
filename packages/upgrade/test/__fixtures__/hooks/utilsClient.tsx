import * as React from 'react';
import { trpc } from './utilsClient.trpc';

export function Component() {
  const utils = trpc.useUtils();
  const [value, setValue] = React.useState<number>();

  React.useEffect(() => {
    void utils.client.num.query(5).then(setValue);
  }, [utils]);

  return value === 5 ? 'loaded' : 'loading';
}
