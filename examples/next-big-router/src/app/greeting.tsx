'use client';

import { useSuspenseQuery } from '@tanstack/react-query';
import {
  fromHandle,
  type inferQueryHandle,
} from '@trpc/tanstack-react-query/unstable-handles';
import { useTRPC, type TRPC } from '~/trpc/client';
import { styles } from './styles';

export function Greeting(props: {
  greeting: inferQueryHandle<TRPC['router99']['greeting']>;
}) {
  const trpc = useTRPC();
  const result = useSuspenseQuery(fromHandle(trpc, props.greeting));

  return (
    <div style={styles}>
      <h1>{result.data}</h1>
    </div>
  );
}
