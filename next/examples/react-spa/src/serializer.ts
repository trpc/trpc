import { createSerializer } from '@trpc12/trpc/transformer';

/**
 * Issues and comments carry `Date`s, so both ends use danSON instead of plain
 * JSON. The persisted cache goes through it too (`src/trpc.tsx`).
 */
export const serializer = createSerializer();
