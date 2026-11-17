'use client';

import { useSuspenseQuery } from '@tanstack/react-query';
import {
  fromHandle,
  type inferQueryHandle,
} from '@trpc/tanstack-react-query/unstable-handles';
import { useTRPC, type TRPC } from '~/trpc/client';

export function Greeting(props: {
  greeting: inferQueryHandle<TRPC['greeting']>;
}) {
  const trpc = useTRPC();
  // 💡 Tip: CMD+Click (or CTRL+Click) on `greeting` in `page.tsx` to go to the server definition
  const result = useSuspenseQuery(fromHandle(trpc, props.greeting));

  /**
   * The type is defined and can be autocompleted
   * 💡 Tip: Hover over `data` to see the result type
   * 💡 Tip: CMD+Click (or CTRL+Click) on `text` to go to the server definition
   * 💡 Tip: Secondary click on `text` and "Rename Symbol" to rename it both on the client & server
   */
  return <h1>{result.data.text}</h1>;
}
