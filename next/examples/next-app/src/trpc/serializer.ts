import { createSerializer } from 'trpcdev/serializer';

/** Posts carry `Date`s and files go both ways, so every end uses danSON instead of plain JSON. */
export const serializer = createSerializer();
