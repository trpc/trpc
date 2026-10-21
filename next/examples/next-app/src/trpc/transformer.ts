import { experimental_createProgressiveJson } from '@trpc12/trpc/transformer';

/** Posts carry `Date`s and files go both ways, so every end uses progressive JSON instead of plain JSON. */
export const transformer = experimental_createProgressiveJson();
