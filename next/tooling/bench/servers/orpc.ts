import { createServer } from 'node:http';
import { os } from '@orpc/server';
import { RPCHandler } from '@orpc/server/node';
import { port, schema } from './schema.ts';

const handler = new RPCHandler(
  {
    procedure_1: os.input(schema).handler((opts) => ({
      name: 'procedure_1',
      date: new Date(),
      input: opts.input,
    })),
    procedure_2: os.input(schema).handler((opts) => ({
      name: 'procedure_2',
      date: new Date(),
      input: opts.input,
    })),
    nested: {
      procedure_1: os.input(schema).handler((opts) => ({
        name: 'nested/procedure_1',
        date: new Date(),
        input: opts.input,
      })),
      procedure_2: os.input(schema).handler((opts) => ({
        name: 'nested/procedure_2',
        date: new Date(),
        input: opts.input,
      })),
      nested: {
        procedure_1: os.input(schema).handler((opts) => ({
          name: 'nested/nested/procedure_1',
          date: new Date(),
          input: opts.input,
        })),
        procedure_2: os.input(schema).handler((opts) => ({
          name: 'nested/nested/procedure_2',
          date: new Date(),
          input: opts.input,
        })),
      },
    },
  },
  { allowMethods: ['GET'] },
);

createServer(async (req, res) => {
  const handled = await handler.handle(req, res);
  if (!handled.matched) {
    res.statusCode = 404;
    res.end('Not Found');
  }
}).listen(port, '127.0.0.1');
