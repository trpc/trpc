import { initTRPC } from '@trpc/server';
import { createHTTPServer } from '@trpc/server/adapters/standalone';
import SuperJSON from 'superjson';
import { port, schema } from './schema.ts';

const t = initTRPC.create({ transformer: SuperJSON });
const router = t.router({
  procedure_1: t.procedure
    .input(schema)
    .query(({ input }) => ({ name: 'procedure_1', date: new Date(), input })),
  procedure_2: t.procedure.input(schema).mutation(({ input }) => ({
    name: 'procedure_2',
    date: new Date(),
    input,
  })),
  nested: t.router({
    procedure_1: t.procedure.input(schema).query(({ input }) => ({
      name: 'nested/procedure_1',
      date: new Date(),
      input,
    })),
    procedure_2: t.procedure.input(schema).mutation(({ input }) => ({
      name: 'nested/procedure_2',
      date: new Date(),
      input,
    })),
    nested: t.router({
      procedure_1: t.procedure.input(schema).query(({ input }) => ({
        name: 'nested/nested/procedure_1',
        date: new Date(),
        input,
      })),
      procedure_2: t.procedure.input(schema).mutation(({ input }) => ({
        name: 'nested/nested/procedure_2',
        date: new Date(),
        input,
      })),
    }),
  }),
});

createHTTPServer({ router, createContext: () => ({}) }).listen(
  port,
  '127.0.0.1',
);
