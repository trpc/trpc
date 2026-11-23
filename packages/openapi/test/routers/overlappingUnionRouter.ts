import { initTRPC } from '@trpc/server';

const t = initTRPC.create();

// The `string & {}` member keeps editor autocomplete for the literals
type Size = 'small' | 'large' | (string & {});

export const OverlappingUnionRouter = t.router({
  updatedAt: t.procedure.query((): Date | string => new Date()),

  deletedAt: t.procedure.query((): Date | string | null => null),

  size: t.procedure.query((): Size => 'small'),

  literalOrNumber: t.procedure.query((): 'auto' | number => 'auto'),
});

export type OverlappingUnionRouter = typeof OverlappingUnionRouter;
