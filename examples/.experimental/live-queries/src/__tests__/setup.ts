import { testServerAndClientResource } from '@trpc/client/__tests__/testClientResource';
import { createAppRouter, createDb } from '../server/router';

export type Transport = 'ws' | 'sse';

/**
 * A real HTTP + WebSocket server and a vanilla client.
 *
 * - `ws`: every operation goes over one WebSocket (`wsLink`)
 * - `sse`: subscriptions use `httpSubscriptionLink`, everything else HTTP
 */
export function setup(transport: Transport, opts?: { historySize?: number }) {
  const db = createDb(opts);
  const { router, stats } = createAppRouter(db);
  const ctx = testServerAndClientResource(
    router,
    transport === 'ws' ? { clientLink: 'wsLink' } : {},
  );
  return Object.assign(ctx, { db, stats });
}

/** Strip TanStack DB's `$`-prefixed virtual row props */
export function plain<T extends object>(rows: Iterable<T>) {
  return [...rows]
    .map(
      (row) =>
        Object.fromEntries(
          Object.entries(row).filter(([key]) => !key.startsWith('$')),
        ) as T,
    )
    .sort((a, b) =>
      String((a as { id: unknown }).id).localeCompare(
        String((b as { id: unknown }).id),
      ),
    );
}
