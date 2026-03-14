import { initTRPC } from '@trpc/server';
import type { TRPCDataTransformer } from '@trpc/server';
import { EJSON } from 'bson';
import { z } from 'zod';

export const mongoEjsonTransformer: TRPCDataTransformer = {
  serialize: (value: unknown) => EJSON.serialize(value),
  deserialize: (value: unknown) => EJSON.deserialize(value as Document),
};

const t = initTRPC.create({ transformer: mongoEjsonTransformer });

const richSchema = z.object({
  name: z.string(),
  count: z.number(),
  active: z.boolean(),
  tags: z.array(z.string()),
  at: z.date(),
  meta: z.object({ createdBy: z.string(), updatedAt: z.date() }),
  items: z.array(z.object({ id: z.number(), label: z.string() })),
});

export const MongoEjsonRouter = t.router({
  rich: t.router({
    query: t.procedure
      .input(richSchema)
      .output(richSchema)
      .query(({ input }) => input),

    mutate: t.procedure
      .input(richSchema)
      .output(richSchema)
      .mutation(({ input }) => input),
  }),
});

export type MongoEjsonRouter = typeof MongoEjsonRouter;
