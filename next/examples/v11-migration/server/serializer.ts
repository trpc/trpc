import { createSyncSerializer } from '@trpc12/trpc/transformer';
import superjson from 'superjson';

/** superjson, as v11's `transformer` was; the handler and every v12 link use it. */
export const serializer = createSyncSerializer<Date>(superjson, {
  name: 'superjson',
});
