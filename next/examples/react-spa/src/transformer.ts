import { experimental_createProgressiveJson } from '@trpc12/trpc/transformer';

/**
 * Issues and comments carry `Date`s, so both ends use progressive JSON instead of plain
 * JSON. The persisted cache goes through it too (`src/trpc.tsx`).
 */
export const transformer = experimental_createProgressiveJson();
