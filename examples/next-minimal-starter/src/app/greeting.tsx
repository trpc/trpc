'use client';

import { useSuspenseQuery } from '@tanstack/react-query';
import { useTRPC } from '~/trpc/client';

export function Greeting() {
  const trpc = useTRPC();
  // 💡 Tip: CMD+Click (or CTRL+Click) on `greeting` to go to the server definition
  // The input must match the prefetch in `page.tsx` for the prefetched data to be used
  const greeting = useSuspenseQuery(
    trpc.greeting.queryOptions({ name: 'Next.js' }),
  );

  /**
   * The type is defined and can be autocompleted
   * 💡 Tip: Hover over `data` to see the result type
   * 💡 Tip: CMD+Click (or CTRL+Click) on `text` to go to the server definition
   * 💡 Tip: Secondary click on `text` and "Rename Symbol" to rename it both on the client & server
   */
  return <p className="text-2xl font-semibold">{greeting.data.text}</p>;
}
