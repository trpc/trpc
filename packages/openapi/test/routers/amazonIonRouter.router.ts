import { initTRPC } from '@trpc/server';
import type { TRPCDataTransformer } from '@trpc/server';
import * as ion from 'ion-js';
import { z } from 'zod';

export const amazonIonTransformer: TRPCDataTransformer = {
  serialize(value: unknown): unknown {
    return ion.dumpText(value);
  },
  deserialize(rawValue: unknown): unknown {
    if (typeof rawValue !== 'string') {
      return rawValue;
    }
    return ionTextToJs(rawValue);
  },
};

export function ionTextToJs(text: string): unknown {
  const reader = ion.makeReader(text);
  const type = reader.next();

  if (type === null) {
    return null;
  }

  function readCurrentValue(reader: ion.Reader): unknown {
    const type = reader.type();

    if (type === null) {
      throw new Error('Reader is not positioned on a value');
    }

    if (reader.isNull()) {
      return null;
    }

    switch (type) {
      case ion.IonTypes.NULL:
        return null;

      case ion.IonTypes.BOOL:
        return reader.booleanValue();

      case ion.IonTypes.INT:
        return reader.numberValue();

      case ion.IonTypes.FLOAT:
        return reader.numberValue();

      case ion.IonTypes.DECIMAL:
        return reader.numberValue();

      case ion.IonTypes.TIMESTAMP: {
        const ts = reader.timestampValue();
        return ts ? ts.getDate() : null;
      }

      case ion.IonTypes.SYMBOL:
      case ion.IonTypes.STRING:
        return reader.stringValue();

      case ion.IonTypes.CLOB:
      case ion.IonTypes.BLOB:
        return reader.uInt8ArrayValue();

      case ion.IonTypes.LIST:
      case ion.IonTypes.SEXP: {
        const out: unknown[] = [];
        reader.stepIn();
        while (reader.next() !== null) {
          out.push(readCurrentValue(reader));
        }
        reader.stepOut();
        return out;
      }

      case ion.IonTypes.STRUCT: {
        const out: Record<string, unknown> = {};
        reader.stepIn();
        while (reader.next() !== null) {
          const fieldName = reader.fieldName();
          if (fieldName == null) {
            throw new Error('Encountered struct field without a name');
          }
          out[fieldName] = readCurrentValue(reader);
        }
        reader.stepOut();
        return out;
      }

      default:
        throw new Error(`Unsupported Ion type: ${type.name}`);
    }
  }

  const value = readCurrentValue(reader);

  const trailing = reader.next();
  if (trailing !== null) {
    throw new Error('Expected exactly one top-level Ion value');
  }

  return value;
}

const t = initTRPC.create({ transformer: amazonIonTransformer });

const richSchema = z.object({
  name: z.string(),
  count: z.number(),
  active: z.boolean(),
  tags: z.array(z.string()),
  at: z.date(),
  meta: z.object({ createdBy: z.string(), updatedAt: z.date() }),
  items: z.array(z.object({ id: z.number(), label: z.string() })),
});

const bigintSchema = z.object({
  id: z.string(),
  amount: z.bigint(),
});

export const AmazonIonRouter = t.router({
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

  bigint: t.procedure
    .input(bigintSchema)
    .output(bigintSchema)
    .query(({ input }) => input),
});

export type AmazonIonRouter = typeof AmazonIonRouter;
