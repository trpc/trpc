import { createServer } from 'node:http';
import { os } from '@orpc/server';
import { RPCHandler } from '@orpc/server/node';
import { port, schema } from './schema.ts';

const handler = new RPCHandler(
  {
    procedure_1: os.input(schema).handler(({ input }) => ({
      name: 'procedure_1',
      date: new Date(),
      input,
    })),
    procedure_2: os.input(schema).handler(({ input }) => ({
      name: 'procedure_2',
      date: new Date(),
      input,
    })),
    nested: {
      procedure_1: os.input(schema).handler(({ input }) => ({
        name: 'nested/procedure_1',
        date: new Date(),
        input,
      })),
      procedure_2: os.input(schema).handler(({ input }) => ({
        name: 'nested/procedure_2',
        date: new Date(),
        input,
      })),
      nested: {
        procedure_1: os.input(schema).handler(({ input }) => ({
          name: 'nested/nested/procedure_1',
          date: new Date(),
          input,
        })),
        procedure_2: os.input(schema).handler(({ input }) => ({
          name: 'nested/nested/procedure_2',
          date: new Date(),
          input,
        })),
      },
    },
  },
  { allowMethods: ['GET'] },
);

createServer(async (req, res) => {
  const { matched } = await handler.handle(req, res);
  if (!matched) {
    res.statusCode = 404;
    res.end('Not Found');
  }
}).listen(port, '127.0.0.1');
