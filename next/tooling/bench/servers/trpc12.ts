import { createServer } from 'node:http';
import { NodeHttpServer, NodeRuntime } from '@effect/platform-node';
import { Layer } from 'effect';
import { serve } from '@trpc12/trpc/http';
import { createSerializer } from '@trpc12/trpc/serializer';
import { createFetchHandler, initTrpc } from '@trpc12/trpc/server';
import { port, schema } from './schema.ts';

const t = initTrpc();
const handler = createFetchHandler({
  router: {
    procedure_1: t.procedure.input(schema).query((opts) => ({
      name: 'procedure_1',
      date: new Date(),
      input: opts.input,
    })),
    procedure_2: t.procedure.input(schema).mutation((opts) => ({
      name: 'procedure_2',
      date: new Date(),
      input: opts.input,
    })),
    nested: {
      procedure_1: t.procedure.input(schema).query((opts) => ({
        name: 'nested/procedure_1',
        date: new Date(),
        input: opts.input,
      })),
      procedure_2: t.procedure.input(schema).mutation((opts) => ({
        name: 'nested/procedure_2',
        date: new Date(),
        input: opts.input,
      })),
      nested: {
        procedure_1: t.procedure.input(schema).query((opts) => ({
          name: 'nested/nested/procedure_1',
          date: new Date(),
          input: opts.input,
        })),
        procedure_2: t.procedure.input(schema).mutation((opts) => ({
          name: 'nested/nested/procedure_2',
          date: new Date(),
          input: opts.input,
        })),
      },
    },
  },
  serializer: createSerializer(),
});

serve(handler).pipe(
  Layer.provide(
    NodeHttpServer.layer(createServer, { port, host: '127.0.0.1' }),
  ),
  Layer.launch,
  NodeRuntime.runMain,
);
